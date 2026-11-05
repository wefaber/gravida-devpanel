// GraphQL documents and shapes of the DB editor. The server masks secret columns; `MASK` is what they arrive as.
export const MASK = '••••••••'

export interface TableSummary {
  name: string
  rows: number
}

export interface Column {
  name: string
  type: string
  kind: string
  nullable: boolean
  key: string
  defaultValue: string | null
  extra: string
  enumValues: string[]
  secret: boolean
  editable: boolean
}

export type Cell = string | null
export type Row = Record<string, Cell>

export interface RowsPage {
  table: string
  total: number
  page: number
  pageSize: number
  pk: string[]
  columns: Column[]
  rows: Row[]
}

export interface ConsoleResult {
  columns: string[]
  rows: Cell[][]
  truncated: boolean
  verb: string
}

export interface ExecResult {
  verb: string
  dumpFile: string
}

export const MY_ACCESS = /* GraphQL */ `
  {
    myAccess {
      capabilities
      f2aEnabled
    }
  }
`

export const TABLES = /* GraphQL */ `
  query DbTables {
    dbTables {
      name
      rows
    }
  }
`

export const ROWS = /* GraphQL */ `
  query DbRows($table: String!, $page: Int, $pageSize: Int, $filter: String) {
    dbRows(table: $table, page: $page, pageSize: $pageSize, filter: $filter) {
      table
      total
      page
      pageSize
      pk
      columns {
        name
        type
        kind
        nullable
        key
        defaultValue
        extra
        enumValues
        secret
        editable
      }
      rows
    }
  }
`

export const UPSERT = /* GraphQL */ `
  mutation DbUpsertRow(
    $table: String!
    $pk: JSON!
    $values: JSON!
    $otp: String
  ) {
    dbUpsertRow(table: $table, pk: $pk, values: $values, otp: $otp)
  }
`

export const INSERT = /* GraphQL */ `
  mutation DbInsertRow($table: String!, $values: JSON!, $otp: String) {
    dbInsertRow(table: $table, values: $values, otp: $otp)
  }
`

export const DELETE = /* GraphQL */ `
  mutation DbDeleteRow($table: String!, $pk: JSON!, $confirm: String!) {
    dbDeleteRow(table: $table, pk: $pk, confirm: $confirm)
  }
`

export const CONSOLE = /* GraphQL */ `
  query DbConsole($sql: String!) {
    dbQuery(sql: $sql) {
      columns
      rows
      truncated
      verb
    }
  }
`

export const EXECUTE = /* GraphQL */ `
  mutation DbExecute($sql: String!, $otp: String) {
    dbExecute(sql: $sql, confirm: true, otp: $otp) {
      verb
      dumpFile
    }
  }
`

/** `ubicacion#1`, or `consulta_ubicacion#123,4` for a composite key. Same label the server asks you to type to delete. */
export function rowLabel(table: string, pk: string[], row: Row): string {
  return `${table}#${pk.map((k) => row[k] ?? '').join(',')}`
}
