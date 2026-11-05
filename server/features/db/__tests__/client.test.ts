import { describe, expect, test } from 'bun:test'
import { serverMessage } from '../client'

const FK =
  'Cannot add or update a child row: a foreign key constraint fails (`nexus`.`prestamos`, CONSTRAINT `fk_cedula` FOREIGN KEY (`cedula`) REFERENCES `usuario` (`cedula`))'

describe('serverMessage', () => {
  test('strips the client prefix from a plain error', () => {
    expect(serverMessage(`ERROR 1452 (23000) at line 1: ${FK}\n`)).toBe(FK)
  })

  test('skips the statement the client echoes between dashes', () => {
    const stderr = [
      '--------------',
      "INSERT INTO prestamos (cedula) VALUES ('87654321')",
      '--------------',
      '',
      `ERROR 1452 (23000) at line 1: ${FK}`,
      '',
    ].join('\n')
    expect(serverMessage(stderr)).toBe(FK)
  })

  test('strips the prefix when the client prints no line number', () => {
    expect(serverMessage('ERROR 1146 (42S02): Table x.y doesn’t exist\n')).toBe(
      'Table x.y doesn’t exist',
    )
  })

  test('falls back to the first non-separator line when there is no ERROR line', () => {
    expect(
      serverMessage(
        '--------------\nmariadb-dump: Got error: 1045: Access denied\n',
      ),
    ).toBe('mariadb-dump: Got error: 1045: Access denied')
  })

  test('says so when stderr has nothing readable', () => {
    expect(serverMessage('')).toBe('error desconocido')
    expect(serverMessage('--------------\n--------------\n')).toBe(
      'error desconocido',
    )
  })

  test('caps the length', () => {
    expect(
      serverMessage(`ERROR 1064 (42000) at line 1: ${'x'.repeat(500)}`),
    ).toHaveLength(300)
  })
})
