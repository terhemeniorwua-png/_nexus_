# Nexus Teams (Phase 7)

Teams group workspace members so they can be assigned to projects as a unit. A team is owned by a workspace; each team has a lead plus members. Projects link to a team via `projects.teamId` (nullable, so a project can exist without a team).

## Data model

- `teams` — `{ workspaceId, name (unique per workspace), description }` (`docs/database.md`).
- `teammembers` — `{ teamId, userId, role: TEAM_LEAD | MEMBER, joinedAt }`, unique per `(teamId, userId)`.

The workspace's own members (`workspacemembers`) are the pool you draw team members from. You can only add a user who is already a **member of the same workspace**; a user can belong to many teams.

## Permissions

| Action | Gate | Who |
| --- | --- | --- |
| View team list / detail / members | `view_teams` | Owner, Admin, Member, Viewer |
| Create / update / delete team | `manage_teams` | Owner, Admin |
| Add / remove / change role of team members | `manage_team_members` | Owner, Admin — **or the team's own lead** (`TEAM_LEAD`) |

The team-lead path is membership-based (`req.isTeamLead`), not part of the role matrix. Only workspace owners/admins may grant the `TEAM_LEAD` role; a team lead who is not an admin may only add members as `MEMBER`.

## Creating a team

`POST /api/teams` with `{ workspaceId, name, description }`. The creator is added automatically as `TEAM_LEAD`. Duplicate names → **409**.

## API

| Method | Route | Notes |
| --- | --- | --- |
| `GET` | `/api/workspaces/:workspaceId/teams` | Teams of a workspace, with member/project counts |
| `POST` | `/api/teams` | Create (creator becomes `TEAM_LEAD`) |
| `GET` | `/api/teams/:teamId` | Team + workspace + requester role + `isTeamLead` + linked projects |
| `PATCH` | `/api/teams/:teamId` | Update name/description |
| `DELETE` | `/api/teams/:teamId` | Remove team + its `teammembers`; null `projects.teamId` (**projects kept**) |
| `GET` | `/api/teams/:teamId/members` | Members with user info + roles |
| `POST` | `/api/teams/:teamId/members` | `{ userId }` → adds as `MEMBER` (404 user not a workspace member, 409 already on team) |
| `PATCH` | `/api/teams/:teamId/members/:userId` | Change role (403 non-admin granting `TEAM_LEAD`) |
| `DELETE` | `/api/teams/:teamId/members/:userId` | Remove member |

## Lifecycle notes

- Deleting a team **never deletes its projects**. They remain on the workspace with `teamId` reset to `null`.
- Adding/removing members emits activity (`TEAM_MEMBER_ADDED` / `TEAM_MEMBER_REMOVED`, `targetType: "team"`); added members receive a `MEMBER_ADDED` notification.
- Team create/update/delete log `TEAM_CREATED` / `TEAM_UPDATED` / `TEAM_DELETED` activity (`docs/database.md` §5).

## Frontend

- `app/workspaces/[workspaceId]/teams` — team grid; create gated to workspace role `Admin`/owner; shows member/project counts and role-styled cards.
- `app/workspaces/[workspaceId]/teams/[teamId]` — team detail with members (add via modal from available workspace members, remove with confirmation) and the team's projects.
- `app/workspaces/[workspaceId]/members` — read-only directory of workspace members and roles.
- Sidebar (`components/workspace/WorkspaceSidebar.jsx`) links to Teams and to the members directory.

## Tests & seed

- `backend/test/teams.test.js` — 26 tests against `nexus_teams_test`: team CRUD, workspace teams list, member lifecycle, cross-workspace rejection, duplicate conflicts, team-lead bypass, and safe-delete (projects preserved). Full suite: **49 passing**.
- `npm run db:seed` — 4 teams (Research, Engineering, Design, Product), 10 team memberships. All dev users log in with `Password123!` (see persons in `docs/authorization.md` §6).