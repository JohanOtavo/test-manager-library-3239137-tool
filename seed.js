#!/usr/bin/env node

// T-21 · Sembrador de datos de demostración.
//
// Habla solo por la API: nunca escribe SQL (data-model §9). Es idempotente en
// lo que puede serlo: si un libro o un socio ya existe, el 409 se ignora y
// sigue.
//
// Uso:
//   API_URL=http://localhost:8000/api/v1 ADMIN_USERNAME=admin ADMIN_PASSWORD=... node seed.js

import { BOOKS, CATEGORIES, MEMBERS, demoIsbn } from './catalogo.js'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const API_URL = process.env.API_URL ?? 'http://localhost:8000/api/v1'
const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? 'admin'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD

const TOTAL_LOANS = 15
const OVERDUE_LOANS = 3
// Veinte días atrás: pasado el plazo de 14, así esas líneas nacen vencidas.
const OVERDUE_OFFSET_DAYS = -20
const STATE_FILE = process.env.MANAGER_LIBRARY_SEED_STATE_PATH
  ?? join(dirname(fileURLToPath(import.meta.url)), '.seed-state.json')

let token = null

async function loadState() {
  try {
    const saved = JSON.parse(await readFile(STATE_FILE, 'utf8'))
    return saved[API_URL] ?? { loans: {} }
  } catch (failure) {
    if (failure.code === 'ENOENT') {
      return { loans: {} }
    }

    throw new Error(`No se pudo leer el estado local del sembrador: ${failure.message}`)
  }
}

async function saveState(state) {
  let saved = {}

  try {
    saved = JSON.parse(await readFile(STATE_FILE, 'utf8'))
  } catch (failure) {
    if (failure.code !== 'ENOENT') {
      throw new Error(`No se pudo leer el estado local del sembrador: ${failure.message}`)
    }
  }

  saved[API_URL] = state
  await writeFile(STATE_FILE, `${JSON.stringify(saved, null, 2)}\n`, 'utf8')
}

async function call(method, path, { body, offsetDays } = {}) {
  const headers = {}

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  if (body) {
    headers['Content-Type'] = 'application/json'
  }

  // La API solo atiende esta cabecera con DEMO_CLOCK activo y APP_ENV=local.
  if (offsetDays) {
    headers['X-Library-Clock-Offset-Days'] = String(offsetDays)
  }

  const response = await fetch(API_URL + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  const payload = response.status === 204 ? null : await response.json().catch(() => null)

  if (!response.ok) {
    const error = new Error(payload?.message ?? `HTTP ${response.status}`)
    error.status = response.status
    error.code = payload?.code
    throw error
  }

  return payload
}

/** Deja pasar los conflictos: sembrar dos veces no debe romper nada. */
async function tolerateConflict(work) {
  try {
    return await work()
  } catch (failure) {
    if (failure.status === 409) {
      return null
    }

    throw failure
  }
}

async function login() {
  if (!ADMIN_PASSWORD) {
    throw new Error('Falta ADMIN_PASSWORD en el entorno.')
  }

  const result = await call('POST', '/auth/login', {
    body: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
  })

  token = result.access_token
  console.log(`Sesión abierta como ${ADMIN_USERNAME} (${result.role}).`)
}

async function seedBooks() {
  let created = 0

  for (const [index, [title, author, category]] of BOOKS.entries()) {
    const result = await tolerateConflict(() =>
      call('POST', '/books', {
        body: {
          title,
          author,
          isbn: demoIsbn(index + 1),
          category_id: CATEGORIES[category],
          // Entre 1 y 4 ejemplares: deja casos con stock y casos al límite.
          total_copies: (index % 4) + 1,
        },
      }),
    )

    if (result) {
      created++
    }
  }

  const catalogue = await call('GET', '/books?page=1&size=50')
  console.log(`Libros: ${created} nuevos, ${catalogue.total} en el catálogo.`)

  return catalogue.items
}

async function seedMembers() {
  let created = 0

  for (const [fullName, documentNumber] of MEMBERS) {
    const result = await tolerateConflict(() =>
      call('POST', '/members', { body: { full_name: fullName, document_number: documentNumber } }),
    )

    if (result) {
      created++
    }
  }

  const members = await call('GET', '/members?page=1&size=50')
  console.log(`Socios: ${created} nuevos, ${members.total} en total.`)

  return members.items
}

/**
 * Reparte los préstamos respetando las dos reglas del socio.
 *
 * Los tres vencidos van a los últimos tres socios, y esos quedan fuera del
 * resto del reparto: si volvieran a salir, la propia regla CA-06.5 los
 * rechazaría y faltarían préstamos. Los demás se reparten entre los otros
 * socios, que así no pasan de 3 libros sin devolver (CA-06.4).
 */
async function seedLoans(books, members, state) {
  const withStock = books.filter((book) => book.available_copies > 0)
  const usedBookIds = new Set(Object.values(state.loans).map((loan) => loan.book_id))
  // Los tres últimos socios cargan con los vencidos; el resto reparte los demás.
  const lateMembers = members.slice(-OVERDUE_LOANS)
  const activeMembers = members.slice(0, -OVERDUE_LOANS)
  let registered = 0
  let overdue = 0

  for (let i = 0; i < TOTAL_LOANS; i++) {
    const slot = String(i)

    if (state.loans[slot]) {
      try {
        await call('GET', `/loans/${state.loans[slot].id}`)
        registered++
        if (i < OVERDUE_LOANS) overdue++
        continue
      } catch (failure) {
        if (failure.status !== 404) {
          throw failure
        }

        delete state.loans[slot]
      }
    }

    const isOverdue = i < OVERDUE_LOANS
    const member = isOverdue
      ? lateMembers[i]
      : activeMembers[(i - OVERDUE_LOANS) % activeMembers.length]
    const book = withStock.find((candidate) => !usedBookIds.has(candidate.id))

    if (!book) {
      break
    }

    try {
      const loan = await call('POST', '/loans', {
        body: { member_id: member.id, items: [{ book_id: book.id }] },
        offsetDays: isOverdue ? OVERDUE_OFFSET_DAYS : undefined,
      })

      state.loans[slot] = { id: loan.id, book_id: book.id }
      usedBookIds.add(book.id)
      await saveState(state)
      registered++

      if (isOverdue) {
        overdue++
      }
    } catch (failure) {
      console.log(`  préstamo omitido (${failure.code ?? failure.status}): ${failure.message}`)
    }
  }

  console.log(`Préstamos: ${registered} registrados, ${overdue} con fecha atrasada.`)
}

async function report() {
  const overdue = await call('GET', '/loans/overdue')
  const today = new Date().toISOString().slice(0, 10)
  const firstOfMonth = today.slice(0, 8) + '01'
  const mostBorrowed = await call('GET', `/reports/most-borrowed?from=${firstOfMonth}&to=${today}`)

  console.log('')
  console.log(`Vencidos ahora mismo: ${overdue.items.length} línea(s).`)
  console.log(`Reporte del mes: ${mostBorrowed.rows.length} fila(s).`)

  if (overdue.items.length < OVERDUE_LOANS) {
    console.log('')
    console.log('Hay menos vencidos de los esperados. Casi siempre es porque la API')
    console.log('corre sin DEMO_CLOCK=true y APP_ENV=local, así que ignoró el desvío')
    console.log('de reloj y registró esos préstamos con la fecha de hoy.')
  }
}

export async function main() {
  await login()
  const books = await seedBooks()
  const members = await seedMembers()
  const state = await loadState()
  await seedLoans(books, members, state)
  await report()
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((failure) => {
    console.error(`Falló la siembra: ${failure.message}`)
    process.exit(1)
  })
}
