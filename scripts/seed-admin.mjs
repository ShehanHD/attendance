/**
 * One-time script to create or promote an admin user.
 * Usage: node scripts/seed-admin.mjs
 *
 * Reads MONGODB_URI and MONGODB_DATABASE from environment (or .env.local).
 */
import { MongoClient } from 'mongodb'
import bcrypt from 'bcryptjs'
import readline from 'readline'

// Load .env.local if present
import { readFileSync } from 'fs'
try {
  const env = readFileSync('.env.local', 'utf8')
  for (const line of env.split('\n')) {
    const [key, ...rest] = line.split('=')
    if (key && rest.length) process.env[key.trim()] = rest.join('=').trim()
  }
} catch { /* no .env.local — rely on existing env */ }

const uri = process.env.MONGODB_URI
const database = process.env.MONGODB_DATABASE
if (!uri || !database) {
  console.error('MONGODB_URI and MONGODB_DATABASE must be set.')
  process.exit(1)
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const ask = q => new Promise(resolve => rl.question(q, resolve))

const client = new MongoClient(uri)
await client.connect()
const db = client.db(database)

console.log('\n── Attendance Admin Setup ──\n')
const name = await ask('Employee name: ')
const email = await ask('Email: ')
const password = await ask('Password (min 8 chars): ')

if (password.length < 8) {
  console.error('Password too short.')
  process.exit(1)
}

const passwordHash = await bcrypt.hash(password, 12)

// Check if employee already exists by email or name
const existing = await db.collection('employees').findOne({
  $or: [{ email: email.toLowerCase() }, { name }],
})

if (existing) {
  // Promote existing employee to admin and set credentials
  await db.collection('employees').updateOne(
    { _id: existing._id },
    { $set: { email: email.toLowerCase(), passwordHash, isAdmin: true, isActive: true } }
  )
  console.log(`\nUpdated existing employee "${existing.name}" → admin with login credentials.`)
} else {
  // Create new admin employee
  const result = await db.collection('employees').insertOne({
    name,
    email: email.toLowerCase(),
    passwordHash,
    standardHours: 8,
    isAdmin: true,
    isActive: true,
    hasTickets: false,
  })
  console.log(`\nCreated admin employee "${name}" (id: ${result.insertedId}).`)
}

console.log('Done. You can now log in at /login.\n')
rl.close()
await client.close()
