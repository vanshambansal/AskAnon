import { useEffect } from 'react'
import Icon from '../common/Icon'
import { BusyButton } from '../common/AsyncFeedback'
import AIAnswer from '../AIAnswer'
import './VaultAssistant.css'

function VaultAnswer({ response, materials }) {
  return <div className="vault-result">
    <p className="vault-asked-question"><span>You asked</span>{response.question}</p>
    <h3 className="vault-answer-label">{response.error ? 'Answer unavailable' : 'Course companion'}</h3>
    <AIAnswer text={response.answer} error={response.error} />
    {response.practice?.length > 0 && <div className="vault-practice">{response.practice.map((item, index) => <article key={index}><h4>Question {index + 1}</h4><p>{item.question}</p><details><summary>Show worked answer</summary><AIAnswer text={item.answer} /></details></article>)}</div>}
    {response.coverage?.sampled && <p className="vault-notice">This overview uses selected passages from {response.coverage.includedDocuments} PDFs, rather than every page.</p>}
    {response.sources?.length > 0 && <div className="vault-source-list" aria-label="Answer sources">{response.sources.map((source, index) => {
      const material = materials.find(item => item.id === source.id)
      const href = material ? `${material.file_url.split('#')[0]}${source.pages?.[0] ? `#page=${source.pages[0]}` : ''}` : null
      return href && <a className="vault-source" key={source.id} href={href} target="_blank" rel="noopener noreferrer"><Icon name="book" /><span><strong>Source {index + 1}: {source.title}</strong><small>{source.pages?.length ? `Pages ${source.pages.join(', ')} - Open PDF` : 'Open PDF'}</small></span></a>
    })}</div>}
    {response.evidence?.length > 0 && <details className="vault-evidence"><summary>View {response.evidence.length} retrieved passages</summary><p>These are the stored text excerpts supplied to the AI for this answer.</p>{response.evidence.map((passage, index) => <article key={`${passage.materialId}-${index}`}><strong>Source {passage.source}: {passage.title}{passage.page ? ` - page ${passage.page}` : ''}</strong><blockquote>{passage.text}</blockquote></article>)}</details>}
  </div>
}

export default function VaultAssistant({ materials, scope, onScopeChange, query, onQueryChange, response, turns = [], loading, onAsk, onClear }) {
  const pdfs = materials.filter(material => material.file_type === 'pdf')
  const ready = pdfs.filter(material => material.index_status === 'ready' || material.indexed_at)
  const canAsk = ready.some(material => scope === 'all' || String(material.id) === scope)
  const choosePrompt = text => { onQueryChange(text); document.getElementById('vault-question')?.focus() }
  const last = turns.at(-1)
  useEffect(() => {
    if (turns.length) document.getElementById(`vault-turn-${turns.length - 1}`)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' })
  }, [turns])
  return <section className="vault-assistant" aria-labelledby="vault-assistant-title" id="vault-assistant">
    <div className="vault-assistant-heading">
      <div><span className="vault-eyebrow"><Icon name="book" /> COURSE VAULT AI</span><h2 id="vault-assistant-title">Your course companion.</h2><p>Understand your PDFs, explore a topic and check what you have learned.</p></div>
      <div className="vault-session-controls"><span className="vault-ready-count">{ready.length} of {pdfs.length} PDFs ready</span>{turns.length > 0 && <button className="btn btn-ghost btn-sm" disabled={loading} onClick={onClear}>New conversation</button>}</div>
    </div>
    <label className="vault-scope" htmlFor="assistant-scope">Search in
      <select id="assistant-scope" className="input" value={scope} disabled={loading} onChange={event => onScopeChange(event.target.value)}>
        <option value="all">All ready PDFs in this course</option>
        {pdfs.map(material => <option key={material.id} value={material.id} disabled={!ready.includes(material)}>{material.title}{!ready.includes(material) ? ' (not ready)' : ''}</option>)}
      </select>
    </label>
    {turns.length > 0 && <div className="vault-conversation" aria-label="Course study conversation">{turns.map((turn, index) => <article id={`vault-turn-${index}`} className="vault-turn" key={`${index}-${turn.generated_at}`}><VaultAnswer response={turn} materials={materials} /></article>)}</div>}
    {response?.error && <div aria-live="polite"><VaultAnswer response={response} materials={materials} /><div className="vault-retry"><BusyButton busy={loading} className="btn btn-secondary btn-sm" onClick={() => onAsk(null, response.question, response.mode || 'ask')}>Retry question</BusyButton>{response.evidence?.length > 0 && <span>You can still read the passages found above.</span>}</div></div>}
    {last && !response?.error && <div className="vault-followups"><span>Keep exploring</span>{last.followUps?.map(question => <button type="button" disabled={loading} key={question} onClick={() => onAsk(null, question)}>{question}<span aria-hidden="true"> &rarr;</span></button>)}<div className="vault-learning-actions"><button type="button" className="btn btn-secondary btn-sm" disabled={loading} onClick={() => onAsk(null, 'Explain the topic we just discussed more simply, with a clear example if the material supports it.')}>Explain more simply</button><button type="button" className="btn btn-secondary btn-sm" disabled={loading} onClick={() => onAsk(null, 'Check my understanding of the topic we just discussed with three practice questions.', 'practice')}>Check my understanding</button></div></div>}
    <form onSubmit={onAsk} className="vault-ask-form">
      <label className="sr-only" htmlFor="vault-question">Your question</label>
      <div className="vault-composer">
        <textarea id="vault-question" rows={3} maxLength={2000} value={query} onChange={event => onQueryChange(event.target.value)} disabled={!canAsk || loading} placeholder={canAsk ? turns.length ? 'Ask a follow-up, or explore another topic...' : 'Ask about a concept, compare ideas or request a detailed explanation...' : 'Add a PDF and wait for it to become ready.'} />
        <div className="vault-composer-footer"><span>{loading ? 'Searching your materials and building an explanation...' : turns.length ? 'Uses your last 3 exchanges. Changing PDFs starts fresh.' : 'Grounded in your selected PDFs. Sources stay visible.'}</span><BusyButton type="submit" className="btn btn-primary" busy={loading} disabled={!query.trim() || !canAsk}>{loading ? 'Working...' : turns.length ? 'Ask follow-up' : 'Ask question'}</BusyButton></div>
      </div>
      {!turns.length && !response && !loading && canAsk && <div className="vault-prompts"><span>Try a question</span><button type="button" onClick={() => choosePrompt('What are the main topics covered in these materials? Explain the important ideas in detail.')}>Walk me through the key ideas</button><button type="button" onClick={() => choosePrompt('Explain the difference between ')}>Compare two concepts</button></div>}
      {!canAsk && <p className="vault-notice">{pdfs.length ? 'No searchable text is ready in this selection. Check the PDF status below; failed indexing can be retried by the instructor.' : 'Upload lecture slides or notes as a PDF to get started. Images can be viewed in the vault.'}</p>}
    </form>
  </section>
}
