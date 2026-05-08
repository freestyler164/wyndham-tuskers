import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { authHeaders, fetchJson } from '../api.js';
import SiteNav from '../components/SiteNav.jsx';

const createBlankQuestion = () => ({
  id: cryptoRandomId(),
  text: '',
  type: 'text',
  options: '',
  analysisMode: 'none',
  required: true,
  conditionQuestionId: '',
  conditionOperator: 'equals',
  conditionValue: '',
});

const analysisOptions = [
  { value: 'none', label: 'None (do not analyse)' },
  { value: 'count', label: 'Count answer choices or repeated values' },
  { value: 'sum', label: 'Add numeric answers together' },
  { value: 'list', label: 'Show individual text responses' },
];

function cryptoRandomId() {
  return Math.random().toString(16).slice(2, 10);
}

const normalizeQuestionType = (type) => {
  const value = String(type || 'text').toLowerCase();
  if (['content', 'plain_text', 'display', 'html', 'markdown'].includes(value)) return 'content';
  if (['textarea', 'long_text', 'longtext', 'paragraph'].includes(value)) return 'textarea';
  if (['number', 'numeric', 'integer'].includes(value)) return 'number';
  if (['choice', 'multiple_choice', 'radio', 'select'].includes(value)) return 'choice';
  if (value === 'date') return 'date';
  return 'text';
};

const normalizeBuilderQuestion = (question = {}) => {
  const type = normalizeQuestionType(question.type);
  const options = Array.isArray(question.options)
    ? question.options.join('\n')
    : String(question.options || question.choices || '');

  return {
    id: question.id || cryptoRandomId(),
    text: question.text || question.label || question.title || '',
    type,
    options,
    analysisMode: type === 'content' ? 'none' : question.analysisMode || (type === 'number' ? 'sum' : 'none'),
    required: type === 'content' ? false : question.required !== false,
    conditionQuestionId: question.visibleWhen?.questionId || question.conditionQuestionId || '',
    conditionOperator: question.visibleWhen?.operator || question.conditionOperator || 'equals',
    conditionValue: question.visibleWhen?.value || question.conditionValue || '',
  };
};

function CreateSurvey({ adminMode = false, editMode = false }) {
  const { id } = useParams();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [questions, setQuestions] = useState([createBlankQuestion()]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (!editMode || !id) return;

    fetchJson(`/surveys/${id}`)
      .then((form) => {
        setTitle(form.title || '');
        setDescription(form.description || '');
        setImageUrl(form.imageUrl || '');
        setQuestions((form.questions || []).map((question) => normalizeBuilderQuestion({
          ...question,
          options: Array.isArray(question.options) ? question.options : question.options,
        })));
      })
      .catch((err) => setError(err.message));
  }, [editMode, id]);

  const updateQuestion = (index, field, value) => {
    const next = [...questions];
    const previousType = next[index].type;
    next[index][field] = value;
    if (field === 'type' && value === 'content') {
      next[index].analysisMode = 'none';
      next[index].required = false;
      next[index].options = '';
    }
    if (field === 'type' && previousType === 'content' && value !== 'content') {
      next[index].required = true;
    }
    if (field === 'type' && value === 'number') {
      next[index].analysisMode = 'sum';
    }
    if (field === 'type' && value !== 'number' && next[index].analysisMode === 'sum') {
      next[index].analysisMode = value === 'choice' ? 'count' : 'none';
    }
    if (field === 'type' && value === 'choice' && next[index].analysisMode === 'none') {
      next[index].analysisMode = 'count';
    }
    setQuestions(next);
  };

  const addQuestion = () => setQuestions((prev) => [...prev, createBlankQuestion()]);
  const removeQuestion = (index) => {
    setQuestions((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
  };

  const importFormJson = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    setMessage('');

    try {
      const text = await file.text();
      const imported = JSON.parse(text);
      if (!imported || typeof imported !== 'object' || !Array.isArray(imported.questions)) {
        throw new Error('JSON must include a questions array.');
      }

      setTitle(imported.title || '');
      setDescription(imported.description || '');
      setImageUrl(imported.imageUrl || '');
      setQuestions(imported.questions.length ? imported.questions.map(normalizeBuilderQuestion) : [createBlankQuestion()]);
      setMessage('JSON imported. Review the form before creating it.');
    } catch (err) {
      setError(err.message || 'Unable to import JSON.');
    } finally {
      event.target.value = '';
    }
  };

  const createSurvey = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    const payload = {
      title,
      description,
      imageUrl,
      questions: questions.map((question) => ({
        id: question.id,
        text: question.text,
        type: question.type,
        analysisMode: question.type === 'content' ? 'none' : question.analysisMode,
        required: question.type === 'content' ? false : question.required,
        visibleWhen: question.conditionQuestionId && question.conditionValue
          ? {
              questionId: question.conditionQuestionId,
              operator: question.conditionOperator,
              value: question.conditionValue,
            }
          : undefined,
        options: question.type === 'choice'
          ? question.options.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
          : undefined,
      })),
    };

    try {
      const survey = await fetchJson(editMode ? `/surveys/${id}` : '/surveys', {
        method: editMode ? 'PATCH' : 'POST',
        headers: editMode ? authHeaders() : undefined,
        body: JSON.stringify(payload),
      });
      setTitle('');
      setDescription('');
      setImageUrl('');
      setQuestions([createBlankQuestion()]);
      setMessage(editMode ? 'Form updated successfully.' : 'Form created successfully.');
      setTimeout(() => navigate(adminMode ? '/admin/surveys' : `/survey/${survey.id}`), 900);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <main className="page-shell">
      {adminMode && <SiteNav />}

      <section className="page-heading">
        <p className="eyebrow">{adminMode ? 'Admin portal' : 'Create form'}</p>
        <h1>{editMode ? 'Edit community form' : adminMode ? 'Create a new community form' : 'Share your thoughts with the community'}</h1>
        <p>
          {adminMode
            ? 'Build a form for members and choose how each answer should be analysed.'
            : 'Create a form to gather feedback from community members.'}
        </p>
      </section>

      <section className="form-panel survey-form-panel">
        <form onSubmit={createSurvey}>
          <div className="json-import-panel">
            <div>
              <span className="eyebrow">Import</span>
              <h2>Build from JSON</h2>
              <p>Upload a form JSON file with title, description, imageUrl and questions.</p>
            </div>
            <label className="btn btn-secondary json-import-button">
              Upload JSON
              <input type="file" accept="application/json,.json" onChange={importFormJson} />
            </label>
          </div>

          <label>Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required />

          <label>Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={"Use simple formatting:\n**bold**, *italic*, - bullet item, [link text](https://example.com)"}
          />
          <p className="field-help">Supports line breaks, bullet lists, bold, italics and links.</p>

          <label>Accent image URL</label>
          <input
            type="url"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://example.com/onam-photo.jpg"
          />
          <p className="field-help">Optional. This appears as a visual accent at the top of the public form.</p>

          <div className="survey-builder">
            <div className="builder-heading">
              <h2>Questions</h2>
              <p className="muted-text">Choose the input type and how admin analytics should treat the answers.</p>
            </div>

            {questions.map((question, index) => (
              <div key={index} className="survey-builder-row">
                <div className="question-main">
                  <label>{question.type === 'content' ? `Text block ${index + 1}` : `Question ${index + 1}`}</label>
                  <textarea
                    placeholder={question.type === 'content' ? 'Context text shown in the form' : 'Question text'}
                    value={question.text}
                    onChange={(e) => updateQuestion(index, 'text', e.target.value)}
                    required
                  />
                  {question.type === 'content' && (
                    <p className="field-help">Supports the same simple formatting as the form description.</p>
                  )}
                </div>

                <div>
                  <label>Input type</label>
                  <select value={question.type} onChange={(e) => updateQuestion(index, 'type', e.target.value)}>
                    <option value="content">Plain text</option>
                    <option value="text">Short text</option>
                    <option value="textarea">Long text</option>
                    <option value="number">Number</option>
                    <option value="choice">Multiple choice</option>
                    <option value="date">Date</option>
                  </select>
                </div>

                {question.type !== 'content' ? (
                  <>
                    <div>
                      <label>Analysis</label>
                      <select value={question.analysisMode} onChange={(e) => updateQuestion(index, 'analysisMode', e.target.value)}>
                        {analysisOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                      <p className="field-help">
                        {question.analysisMode === 'none' && 'Stored with the response but hidden from analytics.'}
                        {question.analysisMode === 'count' && 'Use for yes/no, choices, dates, names or repeated text values.'}
                        {question.analysisMode === 'sum' && 'Use for numbers like guests, children, fees or quantities.'}
                        {question.analysisMode === 'list' && 'Use for comments where admins need to read each response.'}
                      </p>
                    </div>

                    <label className="checkbox-field required-toggle">
                      <input
                        type="checkbox"
                        checked={question.required}
                        onChange={(e) => updateQuestion(index, 'required', e.target.checked)}
                      />
                      Mandatory
                    </label>
                  </>
                ) : (
                  <p className="field-help builder-context-note">Plain text is shown to members only. It is not submitted, analysed or exported.</p>
                )}

                {question.type === 'choice' && (
                  <div className="question-options">
                    <label>Options</label>
                    <textarea
                      placeholder={"One option per line\nYes, count us in\nMaybe, please check with us\nNot this time"}
                      value={question.options}
                      onChange={(e) => updateQuestion(index, 'options', e.target.value)}
                      required
                    />
                  </div>
                )}

                <div className="condition-builder">
                  <label>{question.type === 'content' ? 'Show this text when' : 'Show this question when'}</label>
                  <div className="condition-grid">
                    <select
                      value={question.conditionQuestionId}
                      onChange={(e) => updateQuestion(index, 'conditionQuestionId', e.target.value)}
                      disabled={index === 0}
                    >
                      <option value="">Always show</option>
                      {questions.slice(0, index).map((previousQuestion, previousIndex) => (
                        previousQuestion.type !== 'content' && (
                        <option key={previousQuestion.id} value={previousQuestion.id}>
                          Q{previousIndex + 1}: {previousQuestion.text || 'Untitled question'}
                        </option>
                        )
                      ))}
                    </select>
                    <select
                      value={question.conditionOperator}
                      onChange={(e) => updateQuestion(index, 'conditionOperator', e.target.value)}
                      disabled={!question.conditionQuestionId}
                    >
                      <option value="equals">equals</option>
                      <option value="not_equals">does not equal</option>
                    </select>
                    <input
                      placeholder="Answer value"
                      value={question.conditionValue}
                      onChange={(e) => updateQuestion(index, 'conditionValue', e.target.value)}
                      disabled={!question.conditionQuestionId}
                    />
                  </div>
                  <p className="field-help">
                    {question.type === 'content'
                      ? 'Conditional text can depend on answers to earlier questions. Add the text block below the question it depends on.'
                      : 'Conditional questions can depend on answers to earlier questions.'}
                  </p>
                </div>

                <button type="button" className="btn btn-ghost remove-question-btn" onClick={() => removeQuestion(index)}>
                  Remove
                </button>
              </div>
            ))}

            <button type="button" className="btn btn-secondary add-question-btn" onClick={addQuestion}>Add question</button>
          </div>

          <div className="form-actions">
            {adminMode && <Link className="btn btn-secondary" to="/admin/surveys">Cancel</Link>}
            <button type="submit" className="btn btn-primary">{editMode ? 'Update form' : 'Create form'}</button>
          </div>
        </form>
        {message && <p className="message">{message}</p>}
        {error && <p className="message error-message">{error}</p>}
      </section>
    </main>
  );
}

export default CreateSurvey;
