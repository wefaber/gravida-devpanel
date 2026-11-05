// Access: capabilities granted by an admin and the F2A that guards sensitive writes. Owns everything under
// server/features/access/: GraphQL fields (graphql.ts), use cases (service.ts), tests in __tests__/.
import type { Feature } from '../../deps'
import './graphql'

export const feature: Feature = { name: 'access' }
