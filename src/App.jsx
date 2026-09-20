import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

const API = 'https://api.github.com'
const SAMPLE_USER = 'torvalds'
const SAMPLE_USERS = ['Amal0006', 'torvalds', 'gaearon']
const USERNAME_RE = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i
const THEME_KEY = 'gpe-theme'

const LANG_COLORS = {
  JavaScript: '#f1e05a',
  TypeScript: '#3178c6',
  Python: '#3572a5',
  HTML: '#e34c26',
  CSS: '#563d7c',
  SCSS: '#c6538c',
  Java: '#b07219',
  C: '#555555',
  'C++': '#f34b7d',
  'C#': '#178600',
  Go: '#00add8',
  Rust: '#dea584',
  PHP: '#4f5d95',
  Ruby: '#701516',
  Swift: '#f05138',
  Kotlin: '#a97bff',
  Dart: '#00b4ab',
  Shell: '#89e051',
  Vue: '#41b883',
  'Jupyter Notebook': '#da5b0b',
}

const SORTS = [
  { id: 'updated', label: 'Recent' },
  { id: 'stars', label: 'Stars' },
  { id: 'name', label: 'Name' },
]

const activity = (repo) => new Date(repo.pushed_at ?? repo.updated_at)

const SORTERS = {
  updated: (a, b) => activity(b) - activity(a),
  stars: (a, b) => b.stargazers_count - a.stargazers_count || activity(b) - activity(a),
  name: (a, b) => a.name.localeCompare(b.name),
}

/* ---------- Helpers ---------- */

const compact = new Intl.NumberFormat('en', { notation: 'compact' })
const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
const TIME_UNITS = [
  ['year', 31536000],
  ['month', 2592000],
  ['week', 604800],
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
]

function timeAgo(iso) {
  const seconds = (new Date(iso) - Date.now()) / 1000
  for (const [unit, size] of TIME_UNITS) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit)
  }
  return 'just now'
}

function cleanUsername(raw) {
  return raw
    .trim()
    .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
    .replace(/^@/, '')
    .replace(/\/.*$/, '')
}

function getInitialTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    /* storage unavailable */
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function apiError(kind, extra = {}) {
  return Object.assign(new Error(kind), { kind, ...extra })
}

async function fetchProfile(username, signal) {
  const name = encodeURIComponent(username)
  const [userRes, repoRes] = await Promise.all([
    fetch(`${API}/users/${name}`, { signal }),
    fetch(`${API}/users/${name}/repos?per_page=100&sort=updated`, { signal }),
  ])

  if (userRes.status === 404) throw apiError('not-found')

  const limited = [userRes, repoRes].find((r) => r.status === 403 || r.status === 429)
  if (limited) {
    const reset = Number(limited.headers.get('x-ratelimit-reset'))
    throw apiError('rate-limit', { resetAt: reset ? new Date(reset * 1000) : null })
  }

  if (!userRes.ok || !repoRes.ok) throw apiError('network')
  return { user: await userRes.json(), repos: await repoRes.json() }
}

function rankUsers(users, term) {
  const needle = term.toLowerCase()
  const tier = (login) => {
    const l = login.toLowerCase()
    if (l === needle) return 0
    if (l.startsWith(needle)) return 1
    if (l.includes(needle)) return 2
    return 3
  }
  return [...users].sort(
    (a, b) =>
      tier(a.login) - tier(b.login) ||
      a.login.length - b.login.length ||
      a.login.localeCompare(b.login),
  )
}

async function searchUsers(term, signal) {
  const q = encodeURIComponent(`${term} in:login type:user`)
  const wantExact = USERNAME_RE.test(term)

  const [searchRes, exactRes] = await Promise.all([
    fetch(`${API}/search/users?q=${q}&per_page=30`, { signal }),
    wantExact
      ? fetch(`${API}/users/${encodeURIComponent(term)}`, { signal }).catch((err) => {
          if (err.name === 'AbortError') throw err
          return null
        })
      : Promise.resolve(null),
  ])

  if (searchRes.status === 403 || searchRes.status === 429) {
    const reset = Number(searchRes.headers.get('x-ratelimit-reset'))
    throw apiError('rate-limit', { resetAt: reset ? new Date(reset * 1000) : null })
  }
  if (searchRes.status === 422) return { query: term, users: [], total: 0 }
  if (!searchRes.ok) throw apiError('network')

  const body = await searchRes.json()
  const users = [...body.items]

  // The exact username should always be offered, even if search ranks it oddly.
  if (exactRes?.ok) {
    const exact = await exactRes.json()
    const known = users.some((u) => u.login.toLowerCase() === exact.login.toLowerCase())
    if (exact.type === 'User' && !known) users.push(exact)
  }

  return {
    query: term,
    users: rankUsers(users, term),
    total: Math.max(body.total_count, users.length),
  }
}

/* ---------- Icons ---------- */

function Icon({ size = 16, fill = 'none', children }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

const StarIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--star)" stroke="var(--star)" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
)
const ForkIcon = () => (
  <Icon>
    <circle cx="12" cy="18" r="3" />
    <circle cx="6" cy="6" r="3" />
    <circle cx="18" cy="6" r="3" />
    <path d="M18 9v2c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1V9" />
    <path d="M12 12v3" />
  </Icon>
)
const PinIcon = () => (
  <Icon>
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <circle cx="12" cy="10" r="3" />
  </Icon>
)
const BriefcaseIcon = () => (
  <Icon>
    <rect width="20" height="14" x="2" y="7" rx="2" ry="2" />
    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
  </Icon>
)
const LinkIcon = () => (
  <Icon>
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </Icon>
)
const CalendarIcon = () => (
  <Icon>
    <rect width="18" height="18" x="3" y="4" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </Icon>
)
const ArrowIcon = () => (
  <Icon size={20}>
    <path d="M7 7h10v10" />
    <path d="M7 17 17 7" />
  </Icon>
)
const SunIcon = () => (
  <Icon size={20}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
  </Icon>
)
const MoonIcon = () => (
  <Icon size={20}>
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
  </Icon>
)

const SearchIcon = () => (
  <Icon size={18}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Icon>
)
const ArrowLeftIcon = () => (
  <Icon>
    <path d="M19 12H5" />
    <path d="m12 19-7-7 7-7" />
  </Icon>
)

/* ---------- Pieces ---------- */

function Profile({ user }) {
  const blog = user.blog?.trim()
  const blogHref = blog && (/^https?:\/\//i.test(blog) ? blog : `https://${blog}`)

  return (
    <aside className="profile">
      <img className="avatar" src={user.avatar_url} alt={`${user.login} avatar`} width="168" height="168" />
      <h2 className="profile__name">{user.name || user.login}</h2>
      <a className="profile__login" href={user.html_url} target="_blank" rel="noreferrer">
        @{user.login}
      </a>
      {user.bio && <p className="profile__bio">{user.bio}</p>}

      <ul className="facts">
        {user.location && (
          <li>
            <PinIcon />
            {user.location}
          </li>
        )}
        {user.company && (
          <li>
            <BriefcaseIcon />
            {user.company}
          </li>
        )}
        {blog && (
          <li>
            <LinkIcon />
            <a href={blogHref} target="_blank" rel="noreferrer">
              {blog.replace(/^https?:\/\//i, '')}
            </a>
          </li>
        )}
        <li>
          <CalendarIcon />
          Joined {new Date(user.created_at).getFullYear()}
        </li>
      </ul>

      <dl className="stats">
        <div>
          <dt>Followers</dt>
          <dd>{compact.format(user.followers)}</dd>
        </div>
        <div>
          <dt>Following</dt>
          <dd>{compact.format(user.following)}</dd>
        </div>
        <div>
          <dt>Repos</dt>
          <dd>{compact.format(user.public_repos)}</dd>
        </div>
      </dl>

      <a className="btn" href={user.html_url} target="_blank" rel="noreferrer">
        View on GitHub
      </a>
    </aside>
  )
}

function RepoRow({ repo }) {
  const color = LANG_COLORS[repo.language]
  const when = repo.pushed_at ?? repo.updated_at

  return (
    <li>
      <a
        className="repo"
        href={repo.html_url}
        target="_blank"
        rel="noreferrer"
        style={color ? { '--lang': color } : undefined}
      >
        <h3 className="repo__name">
          {repo.name}
          {repo.fork && <span className="tag">Fork</span>}
        </h3>
        <p className={repo.description ? 'repo__desc' : 'repo__desc repo__desc--empty'}>
          {repo.description || 'No description yet'}
        </p>
        <div className="repo__meta">
          {repo.language && (
            <span className="meta">
              <span className="dot" />
              {repo.language}
            </span>
          )}
          {repo.stargazers_count > 0 && (
            <span className="meta">
              <StarIcon />
              {compact.format(repo.stargazers_count)}
              <span className="sr-only"> stars</span>
            </span>
          )}
          {repo.forks_count > 0 && (
            <span className="meta">
              <ForkIcon />
              {compact.format(repo.forks_count)}
              <span className="sr-only"> forks</span>
            </span>
          )}
          <time className="meta" dateTime={when} title={new Date(when).toLocaleDateString()}>
            Updated {timeAgo(when)}
          </time>
        </div>
        <span className="repo__go">
          <ArrowIcon />
        </span>
      </a>
    </li>
  )
}

function Idle({ onOpen }) {
  return (
    <section className="idle">
      <h2>Whose profile do you want to see?</h2>
      <p>Type any part of a GitHub username. The closest matches come first.</p>
      <p className="idle__label">Or open one directly</p>
      <div className="chips" role="group" aria-label="Sample profiles">
        {SAMPLE_USERS.map((name) => (
          <button key={name} type="button" className="chip" onClick={() => onOpen(name)}>
            {name}
          </button>
        ))}
      </div>
    </section>
  )
}

function avatarSrc(url) {
  return `${url}${url.includes('?') ? '&' : '?'}s=96`
}

function UserRow({ user, exact, onOpen }) {
  return (
    <li>
      <button type="button" className="person" onClick={() => onOpen(user.login)}>
        <img className="person__avatar" src={avatarSrc(user.avatar_url)} alt="" width="48" height="48" loading="lazy" />
        <span className="person__text">
          <span className="person__login">{user.login}</span>
          {exact && <span className="tag">Exact match</span>}
        </span>
        <span className="person__go">
          <ArrowIcon />
        </span>
      </button>
    </li>
  )
}

function Results({ results, onOpen }) {
  const { query, users, total } = results
  const needle = query.toLowerCase()

  return (
    <section aria-labelledby="results-title">
      <h2 className="repos__title" id="results-title">
        Users matching “{query}”
      </h2>
      {users.length > 0 ? (
        <>
          <p className="results__note">
            {total > users.length
              ? `Showing the closest ${users.length} of ${compact.format(total)}.`
              : `${users.length} found.`}
          </p>
          <ul className="people">
            {users.map((u) => (
              <UserRow key={u.login} user={u} exact={u.login.toLowerCase() === needle} onOpen={onOpen} />
            ))}
          </ul>
        </>
      ) : (
        <p className="empty">No usernames contain “{query}”. Try fewer letters or a different spelling.</p>
      )}
    </section>
  )
}

function ResultsLoading() {
  return (
    <div className="people" role="status" aria-busy="true">
      <span className="sr-only">Searching users</span>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="skeleton skeleton--person" />
      ))}
    </div>
  )
}

function Loading() {
  return (
    <div className="layout" role="status" aria-busy="true">
      <span className="sr-only">Loading profile</span>
      <div className="profile">
        <div className="skeleton skeleton--avatar" />
        <div className="skeleton skeleton--title" />
        <div className="skeleton skeleton--line" />
        <div className="skeleton skeleton--line skeleton--short" />
      </div>
      <div className="repo-list">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton skeleton--row" />
        ))}
      </div>
    </div>
  )
}

function Notice({ kind, username, resetAt, onRetry, onSample }) {
  const copy = {
    'not-found': {
      title: `No GitHub user called “${username}”`,
      body: 'Check the spelling. A username is the part after github.com/ in a profile link.',
    },
    'rate-limit': {
      title: 'GitHub is limiting requests for now',
      body: resetAt
        ? `Requests reset around ${resetAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. Try again then.`
        : 'Try again in a few minutes.',
    },
    network: {
      title: 'Couldn’t reach GitHub',
      body: 'Check your connection, then try again.',
    },
  }[kind]

  return (
    <div className="notice" role="alert">
      <h2>{copy.title}</h2>
      <p>{copy.body}</p>
      {kind === 'not-found' ? (
        <button type="button" className="btn" onClick={onSample}>
          Load a sample profile
        </button>
      ) : (
        <button type="button" className="btn" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  )
}

/* ---------- App ---------- */

export default function App() {
  const [query, setQuery] = useState('')
  const [state, setState] = useState({ status: 'idle' })
  const [results, setResults] = useState(null)
  const [sort, setSort] = useState('updated')
  const [lang, setLang] = useState('all')
  const [theme, setTheme] = useState(getInitialTheme)
  const controller = useRef(null)

  const begin = useCallback(() => {
    controller.current?.abort()
    controller.current = new AbortController()
    return controller.current
  }, [])

  const openProfile = useCallback(
    async (login) => {
      const ctrl = begin()
      setLang('all')
      setState({ status: 'loading' })
      try {
        const data = await fetchProfile(login, ctrl.signal)
        setState({ status: 'ready', ...data })
      } catch (err) {
        if (err.name === 'AbortError') return
        setState({
          status: 'error',
          kind: err.kind ?? 'network',
          username: login,
          resetAt: err.resetAt,
          retry: 'profile',
        })
      }
    },
    [begin],
  )

  const search = useCallback(
    async (raw) => {
      const term = cleanUsername(raw)
      if (!term) return
      const ctrl = begin()
      setQuery(term)
      setState({ status: 'searching' })
      try {
        const found = await searchUsers(term, ctrl.signal)
        setResults(found)
        if (found.users.length === 1) {
          openProfile(found.users[0].login)
        } else {
          setState({ status: 'results' })
        }
      } catch (err) {
        if (err.name === 'AbortError') return
        setState({
          status: 'error',
          kind: err.kind ?? 'network',
          username: term,
          resetAt: err.resetAt,
          retry: 'search',
        })
      }
    },
    [begin, openProfile],
  )

  const openDirect = useCallback(
    (login) => {
      setResults(null)
      setQuery(login)
      openProfile(login)
    },
    [openProfile],
  )

  useEffect(() => () => controller.current?.abort(), [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {
      /* storage unavailable */
    }
  }, [theme])

  const repos = useMemo(() => (state.status === 'ready' ? state.repos : []), [state])

  const languages = useMemo(() => {
    const counts = new Map()
    repos.forEach((r) => r.language && counts.set(r.language, (counts.get(r.language) ?? 0) + 1))
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [repos])

  const visible = useMemo(() => {
    const list = lang === 'all' ? repos : repos.filter((r) => r.language === lang)
    return [...list].sort(SORTERS[sort])
  }, [repos, lang, sort])

  const canGoBack = results && results.users.length > 1

  return (
    <div className="shell">
      <header className="bar">
        <h1 className="wordmark">GitHub Profile Explorer</h1>

        <form
          className="finder"
          role="search"
          onSubmit={(e) => {
            e.preventDefault()
            search(query)
          }}
        >
          <label className="sr-only" htmlFor="username">
            Search GitHub usernames
          </label>
          <span className="finder__icon" aria-hidden="true">
            <SearchIcon />
          </span>
          <input
            id="username"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search GitHub usernames"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
          />
          <button className="btn" type="submit">
            Search
          </button>
        </form>

        <button
          type="button"
          className="icon-btn"
          onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
        >
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
      </header>

      <main>
        {state.status === 'idle' && <Idle onOpen={openDirect} />}
        {state.status === 'searching' && <ResultsLoading />}
        {state.status === 'results' && results && <Results results={results} onOpen={openProfile} />}
        {state.status === 'loading' && <Loading />}

        {state.status === 'error' && (
          <Notice
            kind={state.kind}
            username={state.username}
            resetAt={state.resetAt}
            onRetry={() => (state.retry === 'search' ? search(state.username) : openProfile(state.username))}
            onSample={() => openDirect(SAMPLE_USER)}
          />
        )}

        {state.status === 'ready' && (
          <>
            {canGoBack && (
              <button type="button" className="back" onClick={() => setState({ status: 'results' })}>
                <ArrowLeftIcon />
                Back to results
              </button>
            )}
            <div className="layout">
              <Profile user={state.user} />

              <section aria-labelledby="repos-title">
                <div className="repos__head">
                  <h2 className="repos__title" id="repos-title">
                    {visible.length} {visible.length === 1 ? 'repository' : 'repositories'}
                  </h2>
                  {repos.length > 1 && (
                    <div className="sort" role="group" aria-label="Sort repositories">
                      {SORTS.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          aria-pressed={sort === s.id}
                          onClick={() => setSort(s.id)}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {languages.length > 1 && (
                  <div className="chips" role="group" aria-label="Filter by language">
                    <button type="button" className="chip" aria-pressed={lang === 'all'} onClick={() => setLang('all')}>
                      All
                    </button>
                    {languages.map(([name, count]) => (
                      <button
                        key={name}
                        type="button"
                        className="chip"
                        aria-pressed={lang === name}
                        onClick={() => setLang(name)}
                        style={LANG_COLORS[name] ? { '--lang': LANG_COLORS[name] } : undefined}
                      >
                        <span className="dot" />
                        {name} {count}
                      </button>
                    ))}
                  </div>
                )}

                {visible.length > 0 ? (
                  <ul className="repo-list">
                    {visible.map((repo) => (
                      <RepoRow key={repo.id} repo={repo} />
                    ))}
                  </ul>
                ) : (
                  <p className="empty">This account has no public repositories yet.</p>
                )}
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  )
}