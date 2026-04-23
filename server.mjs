import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const dist = path.join(__dirname, 'dist')

app.get('/api/gtm', async (req, res) => {
  const id = String(req.query.id ?? '')
  if (!/^GTM-[A-Z0-9]+$/i.test(id)) {
    return res.status(400).type('json').send({ error: 'Valid GTM-XXXXX id required' })
  }
  const url = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(id)}`
  try {
    const r = await fetch(url, { headers: { 'user-agent': 'TagFoundry/1' } })
    if (!r.ok) {
      return res.status(502).type('json').send({ error: `GTM returned ${r.status}` })
    }
    const text = await r.text()
    res.set('Content-Type', 'text/javascript; charset=utf-8')
    res.set('Cache-Control', 'public, max-age=300')
    return res.send(text)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'fetch failed'
    return res.status(500).type('json').send({ error: message })
  }
})

app.use(express.static(dist, { maxAge: '1h', index: false }))

app.get('*', (_req, res) => {
  res.sendFile(path.join(dist, 'index.html'))
})

const port = Number(process.env.PORT) || 4173
app.listen(port, () => {
  console.log(`Tag Foundry listening on http://localhost:${port}`)
})
