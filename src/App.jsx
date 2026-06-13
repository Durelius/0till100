import { Fragment, useMemo, useRef, useState } from 'react'
import { NUM_ROUNDS, QUESTIONS_PER_ROUND, EXACT_BONUS } from './config.js'
import QUESTION_BANK from './data/questions.json'

// Scoring: points = |guess - answer|. Exact guess => EXACT_BONUS (-10).
// Like golf: lowest total wins.
function scoreFor(guess, answer) {
  if (guess === answer) return EXACT_BONUS
  return Math.abs(guess - answer)
}

const PHASE = { SETUP: 'setup', ROUND: 'round', SUMMARY: 'summary', DONE: 'done' }
const MODE = { CARDS: 'cards', NOCARDS: 'nocards' }

// Build a grid: one row per question, one guess slot per player.
// In "no cards" mode `questions` is a 7-long array of { question, answer };
// the answer is prefilled (hidden until scored) and the question text is shown.
function buildGrid(numPlayers, questions) {
  return Array.from({ length: QUESTIONS_PER_ROUND }, (_, i) => ({
    question: questions ? questions[i].question : null,
    answer: questions ? String(questions[i].answer) : '',
    guesses: Array.from({ length: numPlayers }, () => ''),
  }))
}

// Pick NUM_ROUNDS × QUESTIONS_PER_ROUND distinct questions and chunk into rounds.
function drawDeck() {
  const need = NUM_ROUNDS * QUESTIONS_PER_ROUND
  // Only draw questions whose answer is a valid 0–100 integer (the game's range).
  const pool = QUESTION_BANK.filter(
    (q) => Number.isInteger(q.answer) && q.answer >= 0 && q.answer <= 100,
  )
  // Fisher–Yates shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  // If the bank is smaller than needed, allow repeats by cycling.
  const picked = Array.from({ length: need }, (_, i) => pool[i % pool.length])
  return Array.from({ length: NUM_ROUNDS }, (_, r) =>
    picked.slice(r * QUESTIONS_PER_ROUND, (r + 1) * QUESTIONS_PER_ROUND),
  )
}

const isNum = (v) => v !== '' && Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 100

export default function App() {
  const [phase, setPhase] = useState(PHASE.SETUP)
  const [mode, setMode] = useState(MODE.CARDS)
const [players, setPlayers] = useState([''])
  const [round, setRound] = useState(0) // 0-indexed
  const [deck, setDeck] = useState(null) // no-cards mode: questions per round
  const [grid, setGrid] = useState([]) // current round working data
  // roundScores: array (per finished round) of points-per-player => number[]
  const [roundScores, setRoundScores] = useState([])

  const totals = useMemo(() => {
    const t = players.map(() => 0)
    for (const rs of roundScores) rs.forEach((p, i) => { t[i] += p })
    return t
  }, [roundScores, players])

  // ---- Setup ----
  function updatePlayer(i, name) {
    setPlayers((p) => p.map((x, idx) => (idx === i ? name : x)))
  }
  function addPlayer() {
    setPlayers((p) => (p.length < 8 ? [...p, ''] : p))
  }
  function removePlayer(i) {
    setPlayers((p) => (p.length > 1 ? p.filter((_, idx) => idx !== i) : p))
  }
  function startGame(useCards) {
    const cleaned = players.map((p) => p.trim()).filter(Boolean)
    if (cleaned.length < 1) return
    const newDeck = useCards ? null : drawDeck()
    setPlayers(cleaned)
    setMode(useCards ? MODE.CARDS : MODE.NOCARDS)
    setDeck(newDeck)
    setRoundScores([])
    setRound(0)
    setGrid(buildGrid(cleaned.length, newDeck ? newDeck[0] : null))
    setPhase(PHASE.ROUND)
  }

  // ---- Tab moves DOWN a column, wrapping to the top of the next column ----
  // Columns 0..players.length-1 are players; the last column is "Rätt svar".
  const cellRefs = useRef({})
  const noCards = mode === MODE.NOCARDS
  // No editable answer column in no-cards mode, so Tab cycles players only.
  const numCols = noCards ? players.length : players.length + 1
  function handleTab(e, qi, col) {
    if (e.key !== 'Tab') return
    e.preventDefault()
    const dir = e.shiftKey ? -1 : 1
    let r = qi + dir
    let c = col
    if (r >= QUESTIONS_PER_ROUND) { r = 0; c = col + 1 }
    if (r < 0) { r = QUESTIONS_PER_ROUND - 1; c = col - 1 }
    c = (c + numCols) % numCols
    cellRefs.current[`${r}-${c}`]?.focus()
  }

  // ---- Round grid editing ----
  function setGuess(qi, pi, value) {
    setGrid((g) => g.map((row, r) =>
      r === qi
        ? { ...row, guesses: row.guesses.map((x, c) => (c === pi ? value : x)) }
        : row,
    ))
  }
  function setAnswer(qi, value) {
    setGrid((g) => g.map((row, r) => (r === qi ? { ...row, answer: value } : row)))
  }

  const allGuessesFilled = grid.every((row) => row.guesses.every(isNum))
  const allAnswersFilled = grid.every((row) => isNum(row.answer))
  const canScore = allGuessesFilled && allAnswersFilled

  // Per-player points for the current round (computed live for the summary).
  const currentRoundPoints = useMemo(() => {
    if (!canScore) return null
    const pts = players.map(() => 0)
    for (const row of grid) {
      const a = Number(row.answer)
      row.guesses.forEach((g, i) => { pts[i] += scoreFor(Number(g), a) })
    }
    return pts
  }, [grid, players, canScore])

  function scoreRound() {
    if (!canScore) return
    setPhase(PHASE.SUMMARY)
  }

  function nextRound() {
    setRoundScores((rs) => [...rs, currentRoundPoints])
    if (round + 1 < NUM_ROUNDS) {
      const nextR = round + 1
      setRound(nextR)
      setGrid(buildGrid(players.length, deck ? deck[nextR] : null))
      setPhase(PHASE.ROUND)
    } else {
      setPhase(PHASE.DONE)
    }
  }

  function restart() {
    setPhase(PHASE.SETUP)
    setMode(MODE.CARDS)
    setDeck(null)
    setRoundScores([])
    setRound(0)
    setGrid([])
  }

  // For the live summary, totals-so-far include the round we're about to bank.
  const projectedTotals = useMemo(() => {
    if (!currentRoundPoints) return totals
    return totals.map((t, i) => t + currentRoundPoints[i])
  }, [totals, currentRoundPoints])

  return (
    <div className="app">
      <header className="header">
        <h1>0–100</h1>
        <p className="tag">Svarsblankett · lägst poäng vinner, precis som golf</p>
    <br/>
        <p className="tag">Varför vinner pappa varje gång?</p>
      </header>

      {phase === PHASE.SETUP && (
        <section className="card">
          <h2>Spelare</h2>
          <div className="players-setup">
            {players.map((p, i) => (
              <div className="player-row" key={i}>
                <input
                  className="input"
                  placeholder={`Spelare ${i + 1}`}
                  value={p}
                  onChange={(e) => updatePlayer(i, e.target.value)}
                />
                {players.length > 1 && (
                  <button className="btn ghost" onClick={() => removePlayer(i)} aria-label="Ta bort">
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="row gap">
            <button className="btn" onClick={addPlayer} disabled={players.length >= 8}>
              + Lägg till fler spelare
            </button>
            <button
              className="btn primary"
              onClick={() => startGame(true)}
              disabled={players.filter((p) => p.trim()).length < 1}
            >
              Starta spel
            </button>
          </div>
          <p className="rules">
            {NUM_ROUNDS} rundor × {QUESTIONS_PER_ROUND} frågor. Frågorna kommer från korten.
            Skriv in dina gissningar under rundan, fyll i facit på slutet — poängen räknas ut åt er.
            Avstånd till rätt svar = poäng. Exakt rätt ger {EXACT_BONUS} poäng.
          </p>

          <div className="nocards">
            <button
              className="btn link"
              onClick={() => startGame(false)}
              disabled={players.filter((p) => p.trim()).length < 1}
            >
              Vi har inga kort! 🎲
            </button>
            <span className="nocards-hint">
              Spela med slumpade frågor ur appen ({QUESTION_BANK.length} st) — facit kommer automatiskt.
            </span>
          </div>
        </section>
      )}

      {phase === PHASE.ROUND && (
        <section className="card">
          <div className="meta">
            <span className="pill">Runda {round + 1}/{NUM_ROUNDS}</span>
            <span className="pill muted">{noCards ? 'Utan kort 🎲' : `${QUESTIONS_PER_ROUND} frågor`}</span>
          </div>
          <h2>{noCards ? 'Gissa talen' : 'Fyll i gissningar'}</h2>
          <p className="hint">
            {noCards ? (
              <>Skriv allas gissningar (0–100). Facit visas när ni räknar ut rundan.</>
            ) : (
              <>Skriv allas gissningar (0–100). Fyll i <strong>Rätt svar</strong> när rundan är slut.</>
            )}
          </p>

          <div className="sheet-wrap">
            <table className="sheet">
              <thead>
                <tr>
                  <th className="qcol">#</th>
                  {players.map((name, i) => (
                    <th key={i} className="pcol">{name}</th>
                  ))}
                  {!noCards && <th className="acol">Rätt svar</th>}
                </tr>
              </thead>
              <tbody>
                {grid.map((row, qi) => (
                  <Fragment key={qi}>
                    {noCards && (
                      <tr className="qtext-row">
                        <td className="qtext" colSpan={players.length + 1}>
                          <span className="qnum">{qi + 1}.</span> {row.question}
                        </td>
                      </tr>
                    )}
                    <tr>
                      <td className="qcol">{noCards ? '' : qi + 1}</td>
                      {row.guesses.map((g, pi) => (
                        <td key={pi}>
                          <input
                            ref={(el) => { cellRefs.current[`${qi}-${pi}`] = el }}
                            className={`cell ${g !== '' && !isNum(g) ? 'bad' : ''}`}
                            type="number"
                            min="0"
                            max="100"
                            inputMode="numeric"
                            value={g}
                            onChange={(e) => setGuess(qi, pi, e.target.value)}
                            onKeyDown={(e) => handleTab(e, qi, pi)}
                          />
                        </td>
                      ))}
                      {!noCards && (
                        <td>
                          <input
                            ref={(el) => { cellRefs.current[`${qi}-${players.length}`] = el }}
                            className={`cell answer ${row.answer !== '' && !isNum(row.answer) ? 'bad' : ''}`}
                            type="number"
                            min="0"
                            max="100"
                            inputMode="numeric"
                            placeholder="facit"
                            value={row.answer}
                            onChange={(e) => setAnswer(qi, e.target.value)}
                            onKeyDown={(e) => handleTab(e, qi, players.length)}
                          />
                        </td>
                      )}
                    </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <button className="btn primary big" onClick={scoreRound} disabled={!canScore}>
            Räkna ut rundan
          </button>
          {!canScore && (
            <p className="hint center">
              {allGuessesFilled ? 'Fyll i alla rätta svar för att räkna ut.' : 'Fyll i alla gissningar (0–100).'}
            </p>
          )}

          {round > 0 && <Scoreboard players={players} totals={totals} compact title="Ställning hittills" />}
        </section>
      )}

      {phase === PHASE.SUMMARY && currentRoundPoints && (
        <section className="card">
          <div className="meta">
            <span className="pill">Runda {round + 1}/{NUM_ROUNDS}</span>
            <span className="pill muted">Sammanfattning</span>
          </div>
          <h2>Rundans poäng</h2>

          <table className="result-table">
            <thead>
              <tr>
                <th>Spelare</th>
                <th>Denna runda</th>
                <th>Totalt</th>
              </tr>
            </thead>
            <tbody>
              {players
                .map((name, i) => ({ name, round: currentRoundPoints[i], total: projectedTotals[i], i }))
                .sort((a, b) => a.total - b.total)
                .map((r) => (
                  <tr key={r.i} className={r.round < 0 ? 'exact' : ''}>
                    <td>{r.name}</td>
                    <td className="pts">{r.round >= 0 ? `+${r.round}` : r.round}</td>
                    <td className="pts strong">{r.total}</td>
                  </tr>
                ))}
            </tbody>
          </table>

          {noCards ? (
            <QuestionReview players={players} grid={grid} />
          ) : (
            <PerQuestionBreakdown players={players} grid={grid} />
          )}

          <button className="btn primary big" onClick={nextRound}>
            {round + 1 < NUM_ROUNDS ? 'Nästa runda' : 'Visa slutresultat'}
          </button>
        </section>
      )}

      {phase === PHASE.DONE && (
        <section className="card">
          <h2>Slutresultat 🏆</h2>
          <Scoreboard players={players} totals={totals} />
          <button className="btn primary big" onClick={restart}>
            Spela igen
          </button>
        </section>
      )}
    </div>
  )
}

// No-cards summary: walk through every question with its answer and everyone's
// guesses, shown expanded so the group can read it out loud and discuss.
function QuestionReview({ players, grid }) {
  return (
    <div className="review">
      <h3 className="review-title">Genomgång – läs upp och diskutera</h3>
      {grid.map((row, qi) => {
        const a = Number(row.answer)
        const guesses = players
          .map((name, i) => {
            const guess = Number(row.guesses[i])
            return { name, guess, pts: scoreFor(guess, a) }
          })
          .sort((x, y) => x.pts - y.pts)
        return (
          <div className="review-q" key={qi}>
            <div className="review-head">
              <span className="review-num">Fråga {qi + 1}</span>
              <span className="review-answer">Rätt svar: <strong>{a}</strong></span>
            </div>
            <p className="review-text">{row.question}</p>
            <ul className="review-guesses">
              {guesses.map((r, i) => (
                <li key={i} className={r.pts < 0 ? 'exact' : ''}>
                  <span className="rg-name">{r.name}</span>
                  <span className="rg-guess">gissade {r.guess}</span>
                  <span className="rg-pts">{r.pts < 0 ? `${r.pts} 🎯` : `+${r.pts}`}</span>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

function PerQuestionBreakdown({ players, grid }) {
  return (
    <details className="breakdown">
      <summary>Visa poäng per fråga</summary>
      <div className="sheet-wrap">
        <table className="sheet small">
          <thead>
            <tr>
              <th className="qcol">#</th>
              {players.map((name, i) => <th key={i}>{name}</th>)}
              <th className="acol">Svar</th>
            </tr>
          </thead>
          <tbody>
            {grid.map((row, qi) => {
              const a = Number(row.answer)
              return (
                <Fragment key={qi}>
                  {row.question && (
                    <tr className="qtext-row">
                      <td className="qtext" colSpan={players.length + 2}>
                        <span className="qnum">{qi + 1}.</span> {row.question}
                      </td>
                    </tr>
                  )}
                  <tr>
                    <td className="qcol">{qi + 1}</td>
                    {row.guesses.map((g, pi) => {
                      const pts = scoreFor(Number(g), a)
                      return (
                        <td key={pi} className={pts < 0 ? 'exact' : ''}>
                          {g} <span className="sub">({pts >= 0 ? `+${pts}` : pts})</span>
                        </td>
                      )
                    })}
                    <td className="acol strong">{a}</td>
                  </tr>
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </details>
  )
}

function Scoreboard({ players, totals, compact, title }) {
  const standings = players
    .map((name, i) => ({ name, total: totals[i] }))
    .sort((a, b) => a.total - b.total)
  const lowest = standings.length ? standings[0].total : 0

  return (
    <div className={`scoreboard ${compact ? 'compact' : ''}`}>
      <h3 className="sb-title">{title || 'Ställning'}</h3>
      <ol className="standings">
        {standings.map((s, i) => (
          <li key={s.name + i} className={s.total === lowest ? 'leader' : ''}>
            <span className="rank">{i + 1}</span>
            <span className="sb-name">{s.name}</span>
            <span className="sb-total">{s.total}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
