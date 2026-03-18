export default function LyricMeaning({ text, artistName, onClose }) {
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(`"${text}" meaning ${artistName || ''}`)}`

  return (
    <div className="lyric-meaning-popup" onClick={e => e.stopPropagation()}>
      <a href={searchUrl} target="_blank" rel="noopener noreferrer" className="meaning-link">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        Tap to explore meaning
      </a>
      <button className="meaning-close" onClick={onClose}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  )
}
