import { useState } from 'react'
import './App.css'

function App() {
  const [username, setUsername] = useState('')
  const [userData, setUserData] = useState(null)
  const [repos, setRepos] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleSearch = async () => {
    setLoading(true)
    setError(null)
    setUserData(null)
    setRepos([])

    try {
      const userResponse = await fetch(`https://api.github.com/users/${username}`)
      if (userResponse.status === 404) throw new Error('User not found')
      if (userResponse.status === 403) throw new Error('Rate limit exceeded — try again in a bit')
      if (!userResponse.ok) throw new Error('Something went wrong')
      const userData = await userResponse.json()
      setUserData(userData)

      const reposResponse = await fetch(`https://api.github.com/users/${username}/repos?per_page=10&sort=updated`)
      const reposData = await reposResponse.json()
      setRepos(reposData)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app">
      <h1>GitHub Profile Explorer</h1>
      <div className="search-bar">
        <input
          type="text"
          placeholder="Enter GitHub username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <button onClick={handleSearch}>Search</button>
      </div>

      {loading && <p>Loading...</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}

      {userData && (
        <div className="profile">
          <img src={userData.avatar_url} alt={userData.login} width="100" />
          <h2>{userData.name || userData.login}</h2>
          <p>{userData.bio}</p>
          <p>Followers: {userData.followers} | Public Repos: {userData.public_repos}</p>
        </div>
      )}

      {repos.length > 0 && (
        <div className="repo-grid">
          {repos.map((repo) => (
            <div className="repo-card" key={repo.id}>
              <h3>{repo.name}</h3>
              <p>{repo.description || 'No description'}</p>
              <p>⭐ {repo.stargazers_count} &nbsp; 🖥️ {repo.language || 'N/A'}</p>
              <p style={{ fontSize: '0.8em', color: '#888' }}>
                Updated: {new Date(repo.updated_at).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default App