import express from 'express';
import crypto from 'crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand, QueryCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import dotenv from 'dotenv';
import { verifyToken, requireAdmin } from '../middleware/auth.js';
import { awsClientConfig } from '../awsConfig.js';

dotenv.config();
const router = express.Router();

const dynamoClient = new DynamoDBClient(awsClientConfig);
const db = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

const SURVEYS_TABLE = process.env.SURVEYS_TABLE || 'surveys';
const RESPONSES_TABLE = process.env.RESPONSES_TABLE || 'survey_responses';

const buildQuestionId = (question) => question.id || crypto.randomBytes(4).toString('hex');
const formatAnswerValue = (value) => {
  if (Array.isArray(value)) return value.join(', ');
  if (value === undefined || value === null) return '';
  return String(value);
};

const escapeCsv = (value) => `"${formatAnswerValue(value).replace(/"/g, '""')}"`;

const safeFilename = (value) => String(value || 'form')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 80) || 'form';

const normalizeQuestion = (question) => ({
  id: buildQuestionId(question),
  text: question.text,
  type: question.type || 'text',
  analysisMode: question.type === 'content' ? 'none' : question.analysisMode || (question.type === 'number' ? 'sum' : 'count'),
  required: question.type === 'content' ? false : question.required !== false,
  visibleWhen: question.visibleWhen?.questionId && question.visibleWhen?.value
    ? {
        questionId: question.visibleWhen.questionId,
        operator: question.visibleWhen.operator || 'equals',
        value: question.visibleWhen.value,
      }
    : undefined,
  options: question.type === 'choice' ? (question.options || []) : undefined,
});

const isAnswerQuestion = (question) => question.type !== 'content';

const isQuestionVisible = (question, answersById) => {
  if (!question.visibleWhen?.questionId) return true;
  const currentValue = answersById.get(question.visibleWhen.questionId);
  if (question.visibleWhen.operator === 'not_equals') {
    return String(currentValue ?? '') !== String(question.visibleWhen.value);
  }
  return String(currentValue ?? '') === String(question.visibleWhen.value);
};

const getSurveyWithResponses = async (surveyId) => {
  const surveyResult = await db.send(new GetCommand({ TableName: SURVEYS_TABLE, Key: { id: surveyId } }));
  const survey = surveyResult.Item;
  if (!survey) return null;

  const responseResult = await db.send(new QueryCommand({
    TableName: RESPONSES_TABLE,
    KeyConditionExpression: 'surveyId = :surveyId',
    ExpressionAttributeValues: { ':surveyId': surveyId },
  }));

  const responses = (responseResult.Items || [])
    .sort((a, b) => new Date(a.submittedAt || 0) - new Date(b.submittedAt || 0));

  return { survey, responses };
};

const buildResponsePayload = (survey, responses) => {
  const questions = (survey.questions || [])
    .filter(isAnswerQuestion)
    .map((question) => ({
      id: question.id,
      text: question.text,
      type: question.type,
      analysisMode: question.analysisMode || 'count',
    }));

  return {
    surveyId: survey.id,
    title: survey.title,
    questions,
    responses: responses.map((response) => {
      const answerMap = new Map((response.answers || []).map((answer) => [answer.questionId, answer.value]));
      return {
        responseId: response.responseId,
        submittedAt: response.submittedAt,
        answers: questions.map((question) => ({
          questionId: question.id,
          question: question.text,
          value: formatAnswerValue(answerMap.get(question.id)),
        })),
      };
    }),
  };
};

router.post('/', async (req, res) => {
  const { title, description, imageUrl, questions } = req.body;
  if (!title || !Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ message: 'Survey title and at least one question are required.' });
  }

  const survey = {
    id: crypto.randomBytes(12).toString('hex'),
    title,
    description: description || '',
    imageUrl: imageUrl || '',
    questions: questions.map(normalizeQuestion),
    status: 'active',
    createdBy: req.user?.email || 'anonymous',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await db.send(new PutCommand({ TableName: SURVEYS_TABLE, Item: survey }));
  return res.status(201).json(survey);
});

router.get('/', async (req, res) => {
  const params = {
    TableName: SURVEYS_TABLE,
    FilterExpression: '#status = :active',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: { ':active': 'active' },
  };
  const result = await db.send(new ScanCommand(params));
  return res.json(result.Items || []);
});

router.get('/all', verifyToken, requireAdmin, async (req, res) => {
  const result = await db.send(new ScanCommand({ TableName: SURVEYS_TABLE }));
  return res.json(result.Items || []);
});

router.get('/:id', async (req, res) => {
  const result = await db.send(new GetCommand({ TableName: SURVEYS_TABLE, Key: { id: req.params.id } }));
  if (!result.Item) return res.status(404).json({ message: 'Survey not found.' });
  return res.json(result.Item);
});

router.post('/:id/response', async (req, res) => {
  const { answers } = req.body;
  const surveyId = req.params.id;
  if (!Array.isArray(answers)) {
    return res.status(400).json({ message: 'Survey answers are required.' });
  }

  const surveyResult = await db.send(new GetCommand({ TableName: SURVEYS_TABLE, Key: { id: surveyId } }));
  const survey = surveyResult.Item;
  if (!survey || survey.status !== 'active') {
    return res.status(400).json({ message: 'Survey is not available.' });
  }

  const answersById = new Map(answers.map((answer) => [answer.questionId, answer.value]));
  const visibleQuestions = survey.questions.filter((question) => isQuestionVisible(question, answersById));
  const visibleAnswerQuestions = visibleQuestions.filter(isAnswerQuestion);
  const missingRequired = visibleQuestions.find((question) => {
    if (!isAnswerQuestion(question)) return false;
    if (question.required === false) return false;
    const value = answersById.get(question.id);
    return value === undefined || value === null || String(value).trim() === '';
  });

  if (missingRequired) {
    return res.status(400).json({ message: `Required question is missing: ${missingRequired.text}` });
  }

  const visibleQuestionIds = new Set(visibleAnswerQuestions.map((question) => question.id));
  const response = {
    surveyId,
    responseId: crypto.randomBytes(12).toString('hex'),
    submittedAt: new Date().toISOString(),
    answers: answers
      .filter((answer) => visibleQuestionIds.has(answer.questionId))
      .map((answer) => ({
        questionId: answer.questionId,
        value: answer.value,
      })),
  };

  await db.send(new PutCommand({ TableName: RESPONSES_TABLE, Item: response }));
  return res.status(201).json({ message: 'Response recorded.' });
});

router.patch('/:id', verifyToken, requireAdmin, async (req, res) => {
  const { title, description, imageUrl, questions, status } = req.body;
  const updates = [];
  const attrs = { ExpressionAttributeNames: {}, ExpressionAttributeValues: {} };

  if (title) {
    attrs.ExpressionAttributeNames['#title'] = 'title';
    attrs.ExpressionAttributeValues[':title'] = title;
    updates.push('#title = :title');
  }
  if (description !== undefined) {
    attrs.ExpressionAttributeNames['#description'] = 'description';
    attrs.ExpressionAttributeValues[':description'] = description;
    updates.push('#description = :description');
  }
  if (imageUrl !== undefined) {
    attrs.ExpressionAttributeNames['#imageUrl'] = 'imageUrl';
    attrs.ExpressionAttributeValues[':imageUrl'] = imageUrl;
    updates.push('#imageUrl = :imageUrl');
  }
  if (questions) {
    attrs.ExpressionAttributeNames['#questions'] = 'questions';
    attrs.ExpressionAttributeValues[':questions'] = questions.map(normalizeQuestion);
    updates.push('#questions = :questions');
  }
  if (status) {
    attrs.ExpressionAttributeNames['#status'] = 'status';
    attrs.ExpressionAttributeValues[':status'] = status;
    updates.push('#status = :status');
  }

  if (updates.length === 0) {
    return res.status(400).json({ message: 'No valid fields provided for update.' });
  }

  attrs.ExpressionAttributeNames['#updatedAt'] = 'updatedAt';
  attrs.ExpressionAttributeValues[':updatedAt'] = new Date().toISOString();
  updates.push('#updatedAt = :updatedAt');

  const params = {
    TableName: SURVEYS_TABLE,
    Key: { id: req.params.id },
    UpdateExpression: `SET ${updates.join(', ')}`,
    ExpressionAttributeNames: attrs.ExpressionAttributeNames,
    ExpressionAttributeValues: attrs.ExpressionAttributeValues,
    ReturnValues: 'ALL_NEW',
  };

  const result = await db.send(new UpdateCommand(params));
  return res.json(result.Attributes);
});

router.delete('/:id', verifyToken, requireAdmin, async (req, res) => {
  await db.send(new DeleteCommand({ TableName: SURVEYS_TABLE, Key: { id: req.params.id } }));
  return res.status(204).send();
});

router.get('/:id/responses', verifyToken, requireAdmin, async (req, res) => {
  const result = await getSurveyWithResponses(req.params.id);
  if (!result) return res.status(404).json({ message: 'Survey not found.' });

  return res.json(buildResponsePayload(result.survey, result.responses));
});

router.get('/:id/responses.csv', verifyToken, requireAdmin, async (req, res) => {
  const result = await getSurveyWithResponses(req.params.id);
  if (!result) return res.status(404).json({ message: 'Survey not found.' });

  const payload = buildResponsePayload(result.survey, result.responses);
  const headers = ['Response ID', 'Submitted At', ...payload.questions.map((question) => question.text)];
  const rows = payload.responses.map((response) => [
    response.responseId,
    response.submittedAt,
    ...response.answers.map((answer) => answer.value),
  ]);
  const csv = [headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\r\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${safeFilename(payload.title)}-responses.csv"`);
  return res.send(csv);
});

router.get('/:id/analytics', verifyToken, requireAdmin, async (req, res) => {
  const result = await getSurveyWithResponses(req.params.id);
  if (!result) return res.status(404).json({ message: 'Survey not found.' });

  const { survey, responses } = result;
  const analysis = {
    surveyId: req.params.id,
    title: survey.title,
    totalResponses: responses.length,
    questionStats: survey.questions.filter(isAnswerQuestion).map((question) => {
      const stats = {
        questionId: question.id,
        text: question.text,
        type: question.type,
        analysisMode: question.analysisMode || 'count',
        totals: {},
        numeric: { sum: 0, average: 0, count: 0, invalidCount: 0 },
        responses: [],
      };
      responses.forEach((response) => {
        const answer = response.answers.find((item) => item.questionId === question.id);
        if (answer) {
          if (stats.analysisMode === 'none') {
            return;
          } else if (stats.analysisMode === 'sum') {
            const numericValue = Number(answer.value);
            if (Number.isFinite(numericValue)) {
              stats.numeric.sum += numericValue;
              stats.numeric.count += 1;
            } else {
              stats.numeric.invalidCount += 1;
            }
          } else if (stats.analysisMode === 'list') {
            stats.responses.push(String(answer.value));
          } else {
            const value = String(answer.value);
            stats.totals[value] = (stats.totals[value] || 0) + 1;
          }
        }
      });
      if (stats.numeric.count > 0) {
        stats.numeric.average = stats.numeric.sum / stats.numeric.count;
      }
      return stats;
    }),
  };

  return res.json(analysis);
});

export default router;
