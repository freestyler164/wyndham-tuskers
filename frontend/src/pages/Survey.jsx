import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fetchJson } from '../api.js';
import FormattedText from '../components/FormattedText.jsx';
import SiteNav from '../components/SiteNav.jsx';

const toNumber = (value) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
};

const calculateAmount = (question, answers) => {
  const calculation = question.calculation || {};
  if (['field_sum', 'field_rate_sum', 'calculated_amount'].includes(calculation.type) || question.type === 'calculated_amount') {
    const rules = Array.isArray(calculation.rules) ? calculation.rules : [];
    const subtotal = rules.reduce((total, rule) => {
      const quantity = Math.max(0, toNumber(answers[rule.questionId]));
      const rate = toNumber(rule.rate);
      return total + (quantity * rate);
    }, 0);
    const minimumWhenAny = calculation.minimumWhenAny === undefined || calculation.minimumWhenAny === ''
      ? 0
      : toNumber(calculation.minimumWhenAny);
    const hasAnyQuantity = rules.some((rule) => toNumber(answers[rule.questionId]) > 0);
    const amountBeforeCap = hasAnyQuantity ? Math.max(subtotal, minimumWhenAny) : 0;
    const cap = calculation.cap === undefined || calculation.cap === '' ? null : toNumber(calculation.cap);
    return cap && cap > 0 ? Math.min(amountBeforeCap, cap) : amountBeforeCap;
  }

  if (!['capped_fee', 'capped_attendance_fee'].includes(calculation.type)) {
    return 0;
  }

  const adultCount = toNumber(answers[calculation.adultQuestionId]);
  const kidCount = (calculation.kidQuestionIds || []).reduce((total, questionId) => total + toNumber(answers[questionId]), 0);
  const attendeeCount = adultCount + kidCount;
  if (attendeeCount <= 0) return 0;

  const singleAdultFee = Number(calculation.singleAdultFee ?? 40);
  const familyFee = Number(calculation.familyFee ?? 80);
  const cap = Number(calculation.cap ?? familyFee);
  const fee = adultCount === 1 && kidCount === 0 ? singleAdultFee : familyFee;
  return Math.min(fee, cap);
};

const formatCurrency = (amount, currency = 'AUD') => new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency,
  maximumFractionDigits: 0,
}).format(amount);

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
          value: ['calculated_fee', 'calculated_amount'].includes(question.type) ? calculateAmount(question, answers) : answers[question.id] ?? '',
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

    if (['calculated_fee', 'calculated_amount'].includes(question.type)) {
      const amount = calculateAmount(question, answers);
      const currency = question.calculation?.currency || 'AUD';
      return (
        <div className="calculated-fee-card">
          <div>
            <span>Calculated contribution</span>
            <p>{amount > 0 ? 'Based on the attendance numbers entered above.' : 'Enter attendance numbers above to calculate the contribution.'}</p>
          </div>
          <strong>{formatCurrency(amount, currency)}</strong>
        </div>
      );
    }

    if (question.type === 'checkbox') {
      return (
        <label className="survey-option survey-checkbox">
          <input
            type="checkbox"
            checked={answers[question.id] === true}
            onChange={(e) => handleChange(question.id, e.target.checked)}
            required={question.required !== false}
          />
          <span>{question.checkboxLabel || 'I agree'}</span>
        </label>
      );
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
              {!['content', 'calculated_fee', 'calculated_amount'].includes(question.type) && (
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
