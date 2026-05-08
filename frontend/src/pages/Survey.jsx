import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fetchJson } from '../api.js';
import FormattedText from '../components/FormattedText.jsx';
import SiteNav from '../components/SiteNav.jsx';

function Survey() {
  const { id } = useParams();
  const [survey, setSurvey] = useState(null);
  const [answers, setAnswers] = useState({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchJson(`/surveys/${id}`)
      .then(setSurvey)
      .catch((err) => setError(err.message));
  }, [id]);

  const handleChange = (questionId, value) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const isQuestionVisible = (question) => {
    if (!question.visibleWhen?.questionId) return true;
    const currentValue = answers[question.visibleWhen.questionId];
    if (question.visibleWhen.operator === 'not_equals') {
      return String(currentValue ?? '') !== String(question.visibleWhen.value);
    }
    return String(currentValue ?? '') === String(question.visibleWhen.value);
  };

  useEffect(() => {
    if (!survey) return;
    const visibleIds = new Set(survey.questions.filter(isQuestionVisible).map((question) => question.id));
    setAnswers((current) => {
      const next = Object.fromEntries(Object.entries(current).filter(([questionId]) => visibleIds.has(questionId)));
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
  }, [survey, answers]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    const visibleQuestions = survey.questions.filter(isQuestionVisible);
    const payload = {
      answers: visibleQuestions
        .filter((question) => question.type !== 'content')
        .map((question) => ({
          questionId: question.id,
          value: answers[question.id] ?? '',
        })),
    };

    try {
      await fetchJson(`/surveys/${id}/response`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setMessage('Thank you! Your responses have been submitted.');
    } catch (err) {
      setError(err.message);
    }
  };

  if (error) {
    return (
      <main className="page-shell">
        <SiteNav />
        <div className="auth-shell form-auth-shell">
          <div className="auth-card"><p>{error}</p><Link to="/">Back to home</Link></div>
        </div>
      </main>
    );
  }

  if (!survey) {
    return (
      <main className="page-shell">
        <SiteNav />
        <div className="auth-shell form-auth-shell">
          <div className="auth-card"><p>Loading survey...</p></div>
        </div>
      </main>
    );
  }

  const renderQuestion = (question) => {
    if (question.type === 'content') {
      return <FormattedText text={question.text} className="form-context-block" />;
    }

    if (question.type === 'choice') {
      return question.options?.map((option) => (
        <label key={option} className="survey-option">
          <input
            type="radio"
            name={question.id}
            value={option}
            checked={answers[question.id] === option}
            onChange={() => handleChange(question.id, option)}
            required={question.required !== false}
          />
          {option}
        </label>
      ));
    }

    if (question.type === 'textarea') {
      return (
        <textarea
          value={answers[question.id] || ''}
          onChange={(e) => handleChange(question.id, e.target.value)}
          required={question.required !== false}
        />
      );
    }

    return (
      <input
        type={question.type === 'number' ? 'number' : question.type === 'date' ? 'date' : 'text'}
        value={answers[question.id] || ''}
        onChange={(e) => handleChange(question.id, e.target.value)}
        required={question.required !== false}
      />
    );
  };

  const visibleQuestions = survey.questions.filter(isQuestionVisible);

  return (
    <main className="page-shell survey-response-page">
      <SiteNav />
      <div className="auth-shell form-auth-shell">
      <section className="auth-card survey-response-card">
        {survey.imageUrl && (
          <div className="form-accent-image">
            <img src={survey.imageUrl} alt="" />
          </div>
        )}
        <h1>{survey.title}</h1>
        <FormattedText text={survey.description} className="form-description" />
        <form onSubmit={handleSubmit}>
          {visibleQuestions.map((question) => (
            <div key={question.id} className={`survey-question ${question.type === 'content' ? 'survey-context' : ''}`}>
              {question.type !== 'content' && (
                <label>
                  {question.text}
                  {question.required === false && <span className="optional-label">Optional</span>}
                </label>
              )}
              {renderQuestion(question)}
            </div>
          ))}
          <button type="submit" className="btn btn-primary">Submit</button>
        </form>
        {message && <p className="message">{message}</p>}
        <p className="form-note"><Link to="/">Back to home</Link></p>
      </section>
      </div>
    </main>
  );
}

export default Survey;
