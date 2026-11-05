// GraphQL documents and shapes of the Access section: capabilities, F2A and the admin's grants.
import type { Capability } from './capabilities'

export interface MyAccess {
  capabilities: Capability[]
  f2aEnabled: boolean
  f2aPending: boolean
}

export interface Grant {
  id: number
  capability: string
  grantedBy: string
  grantedAt: string
}

export interface AccessUser {
  login: string
  name: string
  role: string
  f2a: boolean
  grants: Grant[]
}

export interface Enrollment {
  secret: string
  uri: string
}

export const MINE = /* GraphQL */ `
  {
    me {
      role
    }
    myAccess {
      capabilities
      f2aEnabled
      f2aPending
    }
  }
`

export const ENROLL = /* GraphQL */ `
  mutation {
    f2aEnroll {
      secret
      uri
    }
  }
`

export const CONFIRM = /* GraphQL */ `
  mutation ($code: String!) {
    f2aConfirm(code: $code)
  }
`

export const USERS = /* GraphQL */ `
  query AccessUsers {
    accessUsers {
      login
      name
      role
      f2a
      grants {
        id
        capability
        grantedBy
        grantedAt
      }
    }
  }
`

export const GRANT = /* GraphQL */ `
  mutation ($login: String!, $capability: String!) {
    grantAccess(login: $login, capability: $capability)
  }
`

export const REVOKE = /* GraphQL */ `
  mutation ($id: Int!) {
    revokeAccess(id: $id)
  }
`

export const RESET_F2A = /* GraphQL */ `
  mutation ($login: String!) {
    f2aReset(login: $login)
  }
`
