import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { BOOKS, demoIsbn } from './catalogo.js'

test('todos los ISBN del catálogo cumplen el checksum ISBN-13 y son únicos', () => {
  const isbns = BOOKS.map((_, index) => demoIsbn(index + 1))

  assert.equal(isbns.length, 40)
  assert.equal(new Set(isbns).size, isbns.length)

  for (const isbn of isbns) {
    assert.match(isbn, /^\d{13}$/)
    const checksum = [...isbn.slice(0, 12)].reduce((sum, digit, position) =>
      sum + Number(digit) * (position % 2 === 0 ? 1 : 3), 0)
    assert.equal((10 - (checksum % 10)) % 10, Number(isbn[12]), `${isbn} tiene dígito de control inválido`)
  }
})

test('demoIsbn rechaza índices fuera del rango admitido', () => {
  assert.throws(() => demoIsbn(-1), RangeError)
  assert.throws(() => demoIsbn(1.5), RangeError)
  assert.throws(() => demoIsbn(Number.MAX_SAFE_INTEGER), RangeError)
})

test('el sembrador falla antes de contactar la API si falta ADMIN_PASSWORD', async () => {
  const originalPassword = process.env.ADMIN_PASSWORD
  delete process.env.ADMIN_PASSWORD

  try {
    const { main } = await import(`./seed.js?missing-password=${Date.now()}`)
    await assert.rejects(main(), /Falta ADMIN_PASSWORD/)
  } finally {
    if (originalPassword === undefined) delete process.env.ADMIN_PASSWORD
    else process.env.ADMIN_PASSWORD = originalPassword
  }
})

test('repetir la siembra contra la misma API no duplica préstamos', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'manager-library-seed-'))
  const originalFetch = globalThis.fetch
  const originalEnv = {
    API_URL: process.env.API_URL,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
    MANAGER_LIBRARY_SEED_STATE_PATH: process.env.MANAGER_LIBRARY_SEED_STATE_PATH,
  }
  const apiUrl = 'https://library.test/api/v1'
  const books = []
  const members = []
  const loans = new Map()
  let nextId = 1
  let loanPosts = 0

  process.env.API_URL = apiUrl
  process.env.ADMIN_PASSWORD = 'test-only-password'
  process.env.MANAGER_LIBRARY_SEED_STATE_PATH = join(directory, 'state.json')

  globalThis.fetch = async (url, options = {}) => {
    const parsed = new URL(url)
    const path = parsed.pathname.replace('/api/v1', '')
    const method = options.method ?? 'GET'
    const body = options.body ? JSON.parse(options.body) : null
    const headers = new Headers(options.headers)
    const json = (payload, status = 200) => new Response(JSON.stringify(payload), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })

    if (path === '/auth/login' && method === 'POST') {
      return json({ access_token: 'test-token', role: 'admin' })
    }

    if (path === '/books' && method === 'POST') {
      if (books.some((book) => book.isbn === body.isbn)) return json({ message: 'duplicado' }, 409)
      const book = { id: `book-${nextId++}`, ...body, available_copies: body.total_copies }
      books.push(book)
      return json(book, 201)
    }

    if (path === '/books' && method === 'GET') {
      const page = Number(parsed.searchParams.get('page') ?? 1)
      const size = Number(parsed.searchParams.get('size') ?? 20)
      const sorted = [...books].sort((left, right) => left.title.localeCompare(right.title))
      return json({ items: sorted.slice((page - 1) * size, page * size), total: sorted.length, page, size })
    }

    if (path === '/members' && method === 'POST') {
      if (members.some((member) => member.document_number === body.document_number)) return json({ message: 'duplicado' }, 409)
      const member = { id: `member-${nextId++}`, ...body }
      members.push(member)
      return json(member, 201)
    }

    if (path === '/members' && method === 'GET') {
      const page = Number(parsed.searchParams.get('page') ?? 1)
      const size = Number(parsed.searchParams.get('size') ?? 20)
      const sorted = [...members].sort((left, right) => left.full_name.localeCompare(right.full_name))
      return json({ items: sorted.slice((page - 1) * size, page * size), total: sorted.length, page, size })
    }

    if (path === '/loans' && method === 'POST') {
      loanPosts++
      const id = `loan-${nextId++}`
      const bookId = body.items[0].book_id
      const book = books.find((candidate) => candidate.id === bookId)
      book.available_copies--
      const late = headers.get('X-Library-Clock-Offset-Days') === '-20'
      const loan = { id, member_id: body.member_id, items: [{ book_id: bookId }], late }
      loans.set(id, loan)
      return json(loan, 201)
    }

    if (path === '/loans/overdue' && method === 'GET') {
      return json({ items: [...loans.values()].filter((loan) => loan.late).map(() => ({})) })
    }

    if (path === '/reports/most-borrowed' && method === 'GET') {
      return json({ rows: [...loans.values()].map(() => ({})) })
    }

    const loanMatch = path.match(/^\/loans\/([^/]+)$/)
    if (loanMatch && method === 'GET') {
      const loan = loans.get(loanMatch[1])
      return loan ? json(loan) : json({ message: 'no existe' }, 404)
    }

    return json({ message: `Ruta de prueba no implementada: ${method} ${path}` }, 500)
  }

  try {
    const { main } = await import(`./seed.js?test=${Date.now()}`)
    await main()
    assert.equal(loanPosts, 15)

    await main()
    assert.equal(loanPosts, 15)
    assert.equal(loans.size, 15)
  } finally {
    globalThis.fetch = originalFetch
    for (const [name, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
    await rm(directory, { recursive: true, force: true })
  }
})
