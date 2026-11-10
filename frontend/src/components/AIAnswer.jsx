import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import './AIAnswer.css'

export default function AIAnswer({ text, error = false }) {
  return <div className={`ai-answer${error ? ' ai-answer-error' : ''}`} role={error ? 'alert' : undefined}>
    <Markdown skipHtml remarkPlugins={[remarkGfm]} components={{ a: ({ children }) => <span>{children}</span>, img: () => null, table: ({ children }) => <div className="ai-table-scroll" role="region" aria-label="Comparison table" tabIndex={0}><table>{children}</table></div> }}>{text || ''}</Markdown>
  </div>
}
