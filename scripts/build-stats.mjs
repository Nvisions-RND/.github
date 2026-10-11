// 조직 프로필 README 의 통계를 만든다 — 조직 전체 최근 1년 커밋 잔디와 연속 기록·하루 커밋·합계(가로 한 줄 표).
//
//   ORG_TOKEN=<repo 읽기 권한 PAT> node scripts/build-stats.mjs
//
// GitHub Actions(.github/workflows/stats.yml)가 매일 돌리고, 결과(profile/stats/*.svg)와 README 의 통계 구역
// (<!-- stats:start --> … <!-- stats:end -->)을 커밋한다. 비공개 저장소까지 읽어야 하므로 GITHUB_TOKEN 이 아니라
// 조직 저장소에 접근할 수 있는 PAT 를 ORG_TOKEN 비밀로 넣어야 한다(없으면 공개 저장소만 보인다).
// 커밋 수는 GitHub 의 `stats/commit_activity`(기본 브랜치, 최근 52주)를 쓴다 — 처음 부르면 202(계산 중)가 와서 잠시 뒤 다시 묻는다.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ORG = 'Nvisions-RND'
const TOKEN = process.env.ORG_TOKEN || process.env.GITHUB_TOKEN
if (!TOKEN) {
  console.error('ORG_TOKEN(또는 GITHUB_TOKEN)이 필요하다')
  process.exit(1)
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const statsDir = path.join(root, 'profile', 'stats')
const readmePath = path.join(root, 'profile', 'README.md')
fs.mkdirSync(statsDir, { recursive: true })

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function api(url, { retry202 = 8 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url.startsWith('http') ? url : `https://api.github.com${url}`, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'nvisions-rnd-profile-stats',
      },
    })
    if (response.status === 202 && attempt < retry202) {
      await sleep(3000)
      continue
    }
    if (!response.ok) throw new Error(`${url}: ${response.status} ${await response.text()}`)
    return { data: await response.json(), link: response.headers.get('link') ?? '' }
  }
}

async function paginate(url) {
  const out = []
  let next = url
  while (next) {
    const { data, link } = await api(next)
    out.push(...data)
    next = /<([^>]+)>;\s*rel="next"/.exec(link)?.[1] ?? null
  }
  return out
}

// ── 데이터 ──────────────────────────────────────────────────────────────────

const repos = (await paginate(`/orgs/${ORG}/repos?per_page=100&type=all`))
  .filter((repo) => repo.name !== '.github' && !repo.archived)
  .sort((a, b) => a.name.localeCompare(b.name, 'en'))

/** 주마다 { week(초), days[7](일~토), total } — 52주 */
const activity = new Map()
for (const repo of repos) {
  const { data } = await api(`/repos/${ORG}/${repo.name}/stats/commit_activity`)
  activity.set(repo.name, Array.isArray(data) ? data : [])
  console.log(`${repo.name}: ${Array.isArray(data) ? data.reduce((s, w) => s + w.total, 0) : '?'} commits`)
}

/** 조직 전체 — 주별 합(같은 주 기준이라 더하면 된다). 저장소마다 주 수가 달라도 week(초)로 맞춘다 */
const orgWeeks = new Map()
for (const weeks of activity.values()) {
  for (const week of weeks) {
    const row = orgWeeks.get(week.week) ?? { week: week.week, days: [0, 0, 0, 0, 0, 0, 0], total: 0 }
    week.days.forEach((n, i) => (row.days[i] += n))
    row.total += week.total
    orgWeeks.set(week.week, row)
  }
}
const orgActivity = [...orgWeeks.values()].sort((a, b) => a.week - b.week).slice(-52)

// ── 잔디(SVG) ───────────────────────────────────────────────────────────────

const PALETTE = {
  dark: { empty: '#161b22', levels: ['#0e4429', '#006d32', '#26a641', '#39d353'], text: '#8b949e', floor: '#30363d' },
  light: { empty: '#ebedf0', levels: ['#9be9a8', '#40c463', '#30a14e', '#216e39'], text: '#57606a', floor: '#d0d7de' },
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** 칸의 단계(0~4) — GitHub 처럼 최댓값에 대한 사분위 */
function levelOf(count, max) {
  if (count <= 0) return 0
  if (max <= 0) return 1
  const r = count / max
  return r <= 0.25 ? 1 : r <= 0.5 ? 2 : r <= 0.75 ? 3 : 4
}

function garden(weeks, theme) {
  const p = PALETTE[theme]
  const cell = 11
  const pitch = 14
  const left = 34
  const top = 18
  const width = left + weeks.length * pitch
  const height = top + 7 * pitch
  const max = Math.max(0, ...weeks.flatMap((w) => w.days))
  const parts = []
  let lastMonth = -1
  weeks.forEach((week, x) => {
    const date = new Date(week.week * 1000)
    const month = date.getUTCMonth()
    if (month !== lastMonth && (x === 0 || date.getUTCDate() <= 7)) {
      if (x === 0 || x > 1) parts.push(`<text x="${left + x * pitch}" y="11" fill="${p.text}" font-size="10">${MONTHS[month]}</text>`)
      lastMonth = month
    }
    week.days.forEach((count, y) => {
      const level = levelOf(count, max)
      const fill = level === 0 ? p.empty : p.levels[level - 1]
      parts.push(
        `<rect x="${left + x * pitch}" y="${top + y * pitch}" width="${cell}" height="${cell}" rx="2" fill="${fill}"><title>${date.toISOString().slice(0, 10)} 주 · ${['일', '월', '화', '수', '목', '금', '토'][y]} · ${count} commits</title></rect>`,
      )
    })
  })
  for (const [y, label] of [[1, 'Mon'], [3, 'Wed'], [5, 'Fri']]) {
    parts.push(`<text x="0" y="${top + y * pitch + 9}" fill="${p.text}" font-size="10">${label}</text>`)
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif">${parts.join('')}</svg>`
}

// ── 숫자 ────────────────────────────────────────────────────────────────────

function summarize(weeks) {
  const days = []
  for (const week of weeks) week.days.forEach((n, i) => days.push({ date: new Date((week.week + i * 86400) * 1000), n }))
  const today = new Date()
  const upto = days.filter((d) => d.date <= today)
  const total = upto.reduce((s, d) => s + d.n, 0)
  const active = upto.filter((d) => d.n > 0).length
  let best = 0
  let run = 0
  for (const d of upto) {
    run = d.n > 0 ? run + 1 : 0
    best = Math.max(best, run)
  }
  let current = 0
  for (let i = upto.length - 1; i >= 0 && upto[i].n > 0; i--) current++
  const highest = upto.reduce((m, d) => (d.n > m.n ? d : m), { n: 0, date: null })
  return { total, active, best, current, highest, average: active ? total / active : 0 }
}

const fmtDate = (value) => (value ? new Date(value).toISOString().slice(0, 10) : '-')

// ── 쓰기 ────────────────────────────────────────────────────────────────────

for (const theme of ['dark', 'light']) {
  fs.writeFileSync(path.join(statsDir, `org-${theme}.svg`), garden(orgActivity, theme))
}

const picture = (name, alt, width) =>
  `<picture><source media="(prefers-color-scheme: dark)" srcset="stats/${name}-dark.svg"><img alt="${alt}" src="stats/${name}-light.svg"${width ? ` width="${width}"` : ''}></picture>`

const org = summarize(orgActivity)
const kst = new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 16)
const lines = []
lines.push('## 기여 현황 · 조직 전체 (최근 1년)')
lines.push('')
lines.push(picture('org', '조직 전체 커밋 잔디', 760))
lines.push('')
// 2026-10-11 3D 잔디·저장소별 표·저장소별 잔디를 뺐다(공개 README 에 비공개 저장소 이름이 보이던 것도 함께) — 숫자는 가로 한 줄 표로
const b = (value) => `<b>${value}</b>`
lines.push('<table>')
// 칸 폭을 위 잔디(760px)에 맞춘다 — GitHub 는 table 폭은 무시하고 칸 폭(width)은 따른다
lines.push('<tr><th width="253">Commit streaks</th><th width="253">Commits per day</th><th width="253">Total</th></tr>')
lines.push(
  `<tr><td align="center">Current ${b(`${org.current} days`)}<br>Best ${b(`${org.best} days`)}</td>` +
    `<td align="center">Highest ${b(org.highest.n)}${org.highest.date ? ` <sub>(${fmtDate(org.highest.date)})</sub>` : ''}<br>Average ${b(`~${org.average.toFixed(2)}`)} <sub>per active day</sub></td>` +
    `<td align="center">${b(org.total.toLocaleString('en-US'))} commits<br>${b(org.active)} active days · ${b(repos.length)} repositories</td></tr>`,
)
lines.push('</table>')
lines.push('')
lines.push(`<sub>매일 자동 갱신 — 마지막 갱신 ${kst} KST · 기본 브랜치의 최근 52주 커밋(GitHub commit_activity)</sub>`)

const readme = fs.readFileSync(readmePath, 'utf8')
const start = readme.indexOf('<!-- stats:start -->')
const end = readme.indexOf('<!-- stats:end -->')
if (start < 0 || end < 0) throw new Error('profile/README.md 에 stats 표지가 없다')
fs.writeFileSync(readmePath, `${readme.slice(0, start)}<!-- stats:start -->\n${lines.join('\n')}\n${readme.slice(end)}`)
console.log(`done — ${repos.length} repos, ${org.total} commits`)
