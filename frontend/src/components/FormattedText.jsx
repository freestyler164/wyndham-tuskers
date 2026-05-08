const inlinePattern = /(\[([^\]]+)\]\((https?:\/\/[^)\s]+|mailto:[^)\s]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*)/g;

function renderInline(text) {
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = inlinePattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[2] && match[3]) {
      parts.push(
        <a key={`${match.index}-link`} href={match[3]} target="_blank" rel="noreferrer">
          {match[2]}
        </a>,
      );
    } else if (match[4]) {
      parts.push(<strong key={`${match.index}-strong`}>{match[4]}</strong>);
    } else if (match[5]) {
      parts.push(<em key={`${match.index}-em`}>{match[5]}</em>);
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

function FormattedText({ text, className = '' }) {
  if (!text) return null;

  const blocks = [];
  let paragraph = [];
  let list = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ type: 'paragraph', lines: paragraph });
      paragraph = [];
    }
  };

  const flushList = () => {
    if (list.length > 0) {
      blocks.push({ type: 'list', items: list });
      list = [];
    }
  };

  text.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    const listMatch = trimmed.match(/^[-*]\s+(.+)/);

    if (!trimmed) {
      flushParagraph();
      flushList();
      return;
    }

    if (listMatch) {
      flushParagraph();
      list.push(listMatch[1]);
      return;
    }

    flushList();
    paragraph.push(trimmed);
  });

  flushParagraph();
  flushList();

  return (
    <div className={`formatted-text ${className}`.trim()}>
      {blocks.map((block, index) => {
        if (block.type === 'list') {
          return (
            <ul key={`list-${index}`}>
              {block.items.map((item, itemIndex) => (
                <li key={`item-${itemIndex}`}>{renderInline(item)}</li>
              ))}
            </ul>
          );
        }

        return (
          <p key={`paragraph-${index}`}>
            {block.lines.map((line, lineIndex) => (
              <span key={`line-${lineIndex}`}>
                {lineIndex > 0 && <br />}
                {renderInline(line)}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

export default FormattedText;
