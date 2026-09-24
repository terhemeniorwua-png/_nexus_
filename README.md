
1. Frontend README — nexus-frontend/README.md

# Nexus — Frontend

> A real-time collaborative project, research, task, and team management platform built for organizations, student teams, and distributed project groups.

Nexus is a modern collaborative workspace that helps teams plan projects, assign work, track progress, submit deliverables, review work, communicate in real time, and maintain a centralized record of project activity.

The frontend is responsible for providing the complete user-facing experience of Nexus, including authentication, workspace management, project management, task execution, file submissions, reviews, communication, notifications, analytics, and real-time collaboration.

---

## Table of Contents

* [Overview](#overview)
* [Core Concept](#core-concept)
* [Frontend Responsibilities](#frontend-responsibilities)
* [Technology Stack](#technology-stack)
* [Application Architecture](#application-architecture)
* [User Roles](#user-roles)
* [Permission Model](#permission-model)
* [Workspace System](#workspace-system)
* [Team System](#team-system)
* [Project System](#project-system)
* [Task Management](#task-management)
* [Subtask and Progress System](#subtask-and-progress-system)
* [Deliverables and Review System](#deliverables-and-review-system)
* [Project Communication](#project-communication)
* [Workspace Communication](#workspace-communication)
* [Direct Messaging](#direct-messaging)
* [Notifications](#notifications)
* [Activity Tracking](#activity-tracking)
* [Project Knowledge Base](#project-knowledge-base)
* [Dashboard](#dashboard)
* [Analytics](#analytics)
* [Authentication](#authentication)
* [Real-Time Features](#real-time-features)
* [Frontend Routing](#frontend-routing)
* [Component Structure](#component-structure)
* [State Management](#state-management)
* [API Communication](#api-communication)
* [Error Handling](#error-handling)
* [Loading States](#loading-states)
* [Responsive Design](#responsive-design)
* [Security Considerations](#security-considerations)
* [Environment Variables](#environment-variables)
* [Installation](#installation)
* [Development](#development)
* [Production Build](#production-build)
* [Recommended Folder Structure](#recommended-folder-structure)
* [Development Principles](#development-principles)
* [Future Improvements](#future-improvements)

---

# Overview

Nexus is designed around the idea that managing a project involves more than simply creating tasks.

A complete project workflow can be represented as:

```text
Workspace
   ↓
Team
   ↓
Project
   ↓
Task
   ↓
Subtasks
   ↓
Work / Attachments / Comments
   ↓
Deliverable
   ↓
Review
   ↓
Approval / Changes Requested
   ↓
Knowledge Base
```

The frontend provides interfaces for every stage of this workflow.

---

# Core Concept

Nexus separates four important concepts:

### 1. Progress

Progress measures how much defined work has been completed.

Example:

```text
Research Task

Subtasks:
✓ Find 5 sources          20%
✓ Research benefits       20%
✓ Research disadvantages  20%
○ Write report            20%
○ Add citations           20%

Progress: 60%
```

### 2. Activity

Activity records meaningful actions performed inside Nexus.

Examples:

```text
Philip started a task
Sarah completed a subtask
John uploaded a document
Mary commented on a task
Philip submitted a deliverable
Sarah approved the submission
```

### 3. Deliverable

A deliverable is the actual output of a task.

Examples:

* PDF
* DOCX
* XLSX
* PPTX
* Images
* Research documents
* Source code
* Design files

### 4. Review

Review determines whether the submitted work is accepted or needs changes.

```text
SUBMITTED
    ↓
UNDER REVIEW
    ↓
 ┌───────────────┐
 ↓               ↓
APPROVED     CHANGES REQUESTED
```

---

# Frontend Responsibilities

The frontend is responsible for:

* Rendering the user interface
* Authentication screens
* Workspace navigation
* Project dashboards
* Team management
* Task management
* Subtask management
* Progress visualization
* File upload interfaces
* Deliverable submission
* Review interfaces
* Comments
* Activity timelines
* Notifications
* Messaging
* Search
* Filters
* Analytics
* Permission-aware UI
* Real-time updates
* Responsive design
* Error states
* Loading states

The frontend does **not** make security decisions by itself.

The backend remains responsible for validating authentication and authorization.

---

# Technology Stack

Recommended stack:

| Technology              | Purpose                 |
| ----------------------- | ----------------------- |
| Next.js                 | Frontend framework      |
| React                   | UI                      |
| JavaScript              | Application language    |
| Tailwind CSS            | Styling                 |
| Lucide React            | Icons                   |
| Axios / Fetch           | API communication       |
| Socket.IO Client        | Real-time communication |
| React Context / Zustand | Client state            |
| React Hook Form         | Form management         |
| Zod                     | Client-side validation  |
| date-fns                | Date handling           |

---

# Application Architecture

The frontend follows a modular architecture.

```text
Next.js Application
│
├── Authentication
│
├── Workspace
│
│   ├── Teams
│   ├── Projects
│   ├── Members
│   └── Communication
│
├── Project
│
│   ├── Overview
│   ├── Tasks
│   ├── Submissions
│   ├── Files
│   ├── Discussions
│   ├── Activity
│   └── Knowledge Base
│
├── Messaging
│
├── Notifications
│
└── User Settings
```

---

# User Roles

Nexus supports multiple levels of access.

## Workspace Owner

The Workspace Owner controls the workspace.

Capabilities include:

* Manage workspace
* Invite users
* Create teams
* Manage workspace members
* Create projects
* View workspace analytics
* Manage workspace settings
* Manage permissions

---

## Project Manager

A Project Manager manages a specific project.

Capabilities include:

* Create tasks
* Assign tasks
* Create subtasks
* Set deadlines
* Review submissions
* Request changes
* Approve deliverables
* View project analytics
* Manage project members

---

## Member

Members perform project work.

Capabilities include:

* View assigned projects
* Work on assigned tasks
* Complete subtasks
* Upload files
* Add comments
* Submit deliverables
* Participate in discussions
* Communicate with other users

---

## Viewer

Viewers have read-only access.

They can:

* View projects
* View tasks
* View approved documents
* View activity

They cannot modify project data.

---

## Collaborator

A collaborator can be invited from another team.

For example:

```text
Team Alpha
    ↓
Project A
    ↓
Invite David
    ↓
David belongs to Team Beta
```

David receives access to Project A without receiving access to Team Alpha's other private projects.

---

# Permission Model

Nexus uses layered permissions.

```text
Workspace Permission
        ↓
Team Permission
        ↓
Project Permission
        ↓
Task Permission
```

A user being part of a workspace does not automatically give them access to every private project.

Example:

```text
Workspace
│
├── Team Alpha
│   └── Project A
│
└── Team Beta
    └── Project B
```

Team Beta cannot automatically open Project A.

If a Team Beta member is invited to Project A, they receive access to Project A only.

---

# Workspace System

The workspace is the highest organizational level.

A workspace can contain:

* Multiple teams
* Multiple projects
* Workspace members
* Workspace channels
* Announcements
* Workspace activity
* Workspace analytics

Example:

```text
Nexus Workspace
│
├── Team Alpha
├── Team Beta
├── Team Gamma
│
├── Projects
│
├── General Chat
├── Announcements
└── Members
```

---

# Team System

Teams group users who commonly work together.

Example:

```text
Team Alpha

Members:
- Philip
- John
- Sarah
- David

Projects:
- E-commerce Platform
- AI Research
```

Teams can have their own:

* Members
* Projects
* Communication channels
* Activity

---

# Project System

Projects represent actual work.

A project contains:

```text
Project
│
├── Overview
├── Tasks
├── Members
├── Files
├── Discussions
├── Activity
├── Submissions
└── Knowledge Base
```

Project information includes:

* Name
* Description
* Project manager
* Members
* Start date
* Deadline
* Status
* Progress
* Tasks
* Milestones
* Activity
* Deliverables

---

# Task Management

Tasks represent units of work.

Example:

```text
Task:
Research Effects of Artificial Intelligence on Education

Assigned to:
Philip

Deadline:
October 10

Priority:
High
```

A task contains:

* Title
* Description
* Assignee
* Collaborators
* Priority
* Deadline
* Status
* Subtasks
* Attachments
* Comments
* Deliverable
* Review
* Activity

---

# Task Status Lifecycle

A task can move through the following lifecycle:

```text
ASSIGNED
    ↓
IN_PROGRESS
    ↓
SUBMITTED
    ↓
UNDER_REVIEW
    ↓
 ┌─────────────────────┐
 ↓                     ↓
APPROVED        CHANGES_REQUESTED
                       ↓
                  IN_PROGRESS
```

A task can also be marked:

```text
BLOCKED
```

when the member cannot continue because of a dependency or external issue.

---

# Subtask and Progress System

Subtasks break large tasks into measurable pieces.

Example:

```text
Research AI in Education

Subtasks:

✓ Find 5 academic sources
✓ Research benefits
✓ Research disadvantages
○ Research student effects
○ Write report
○ Add citations
```

Each subtask can optionally have a weight.

Example:

```text
Find sources             10%
Research benefits        15%
Research disadvantages   15%
Student effects          15%
Write report             30%
Add citations            15%
                         ----
                         100%
```

Task progress is calculated from completed subtask weights.

```text
Completed:
10 + 15 + 15 = 40%

Task Progress:
40%
```

---

# Deliverables and Review System

Subtasks are primarily used for measuring work.

They do not normally require separate formal submissions.

The main task has a final deliverable.

Example:

```text
Task
│
├── Subtasks
│   ├── Find sources
│   ├── Research benefits
│   ├── Research disadvantages
│   ├── Write report
│   └── Add citations
│
└── Final Deliverable
    └── AI-Education-Research.pdf
```

The member clicks:

```text
Submit for Review
```

The Project Manager receives the submission.

---

# Review Workflow

```text
Member
  ↓
Completes Work
  ↓
Uploads Deliverable
  ↓
Submit for Review
  ↓
Project Manager
  ↓
Under Review
  ↓
 ┌─────────────────┐
 ↓                 ↓
Approve       Request Changes
```

When changes are requested:

```text
Changes Requested
        ↓
Member Updates Work
        ↓
New Submission
        ↓
Under Review
```

The frontend should support submission versions so that previous submissions are not lost.

---

# Project Communication

Each project can have a dedicated discussion area.

Example:

```text
Project Discussion

Philip:
I've uploaded the first version of the research.

Sarah:
I'll review the sources.

John:
Section 3 needs more information.
```

Comments can be attached to:

* Projects
* Tasks
* Deliverables
* Reviews

---

# Workspace Communication

Workspace-wide communication is separate from project access.

Example:

```text
Workspace Chat

# general
# announcements
# project-help
# random
```

Users from different teams can communicate here without automatically receiving access to each other's private projects.

---

# Direct Messaging

Users can communicate privately.

```text
Messages
│
├── Philip
├── Sarah
├── John
└── David
```

Direct messaging does not grant project permissions.

For example:

```text
Philip → David

"Can you help review our UI?"
```

David can respond without automatically seeing Philip's project.

---

# Notifications

Nexus provides real-time notifications.

Examples:

```text
You were assigned a task.

Sarah commented on your task.

Your submission was approved.

Changes were requested on your submission.

Your task deadline is tomorrow.

You were invited to a project.
```

Notification categories:

* Task assignment
* Task status
* Comments
* Mentions
* Submissions
* Reviews
* Project invitations
* Messages
* Deadlines

---

# Activity Tracking

Nexus records meaningful actions.

Example activity timeline:

```text
10:30 AM
Philip started "Research AI in Education"

11:10 AM
Philip completed "Find 5 sources"

11:25 AM
Philip uploaded research.pdf

12:00 PM
Sarah commented on the task

1:30 PM
Philip submitted the task for review

2:00 PM
John approved the submission
```

The activity system records actions inside Nexus.

It does not monitor:

* Mouse movement
* Keyboard activity
* Other applications
* Browser activity
* Personal computer activity

---

# Project Knowledge Base

Approved project deliverables can become part of the project's knowledge base.

Example:

```text
Knowledge Base

Research
├── AI in Education
├── Market Analysis
└── Competitor Research

Documents
├── Project Proposal
├── Requirements
└── Final Report

Resources
├── Academic Papers
└── Reference Links
```

Only approved content should automatically enter the official knowledge base.

---

# Dashboard

The main dashboard gives users an overview of their work.

Example:

```text
Good morning, Philip

My Tasks
──────────────
12 Total
5 In Progress
4 Completed
2 Under Review
1 Overdue

Project Progress
─────────────────
AI Research       72%
E-commerce        45%
Healthcare App    88%

Upcoming Deadlines
──────────────────
Research Report    Tomorrow
UI Design          Friday
Final Presentation Next Week
```

---

# Project Dashboard

A project manager can see:

```text
Project Progress        72%

Tasks
─────
Total              25
Completed          12
In Progress         7
Under Review        3
Blocked             2
Not Started         1

Submissions
───────────
Pending Review      3
Approved            8
Changes Requested   2

Team Workload
─────────────
Philip              5 tasks
Sarah               3 tasks
John                7 tasks
```

---

# Analytics

Nexus can provide:

### Project Progress

```text
Completed Tasks
───────────────
████████████░░░ 72%
```

### Task Distribution

```text
Completed
In Progress
Under Review
Blocked
Not Started
```

### Team Workload

Displays how much assigned work each member has.

### Deadline Monitoring

Shows:

* Upcoming
* Due today
* Overdue
* At risk

### Submission Analytics

Shows:

* Submitted
* Approved
* Pending review
* Changes requested

---

# Authentication

The frontend provides:

```text
/register
/login
/forgot-password
/reset-password
```

Authentication uses JWT-based sessions.

After successful login:

```text
User
 ↓
Backend
 ↓
JWT
 ↓
Frontend session
 ↓
Protected dashboard
```

Protected routes redirect unauthenticated users to the login page.

---

# Frontend Routing

Recommended App Router structure:

```text
app/
│
├── page.js
│
├── login/
│   └── page.js
│
├── register/
│   └── page.js
│
├── dashboard/
│   └── page.js
│
├── workspace/
│   └── [workspaceId]/
│       │
│       ├── page.js
│       │
│       ├── teams/
│       ├── projects/
│       ├── messages/
│       ├── notifications/
│       └── settings/
│
├── projects/
│   └── [projectId]/
│       │
│       ├── page.js
│       ├── tasks/
│       ├── submissions/
│       ├── files/
│       ├── activity/
│       ├── discussions/
│       └── knowledge-base/
│
└── settings/
    └── page.js
```

---

# Component Structure

Reusable components should be organized by responsibility.

```text
components/
│
├── ui/
│   ├── Button
│   ├── Modal
│   ├── Input
│   ├── Dropdown
│   ├── Badge
│   └── Avatar
│
├── layout/
│   ├── Sidebar
│   ├── Header
│   └── WorkspaceSwitcher
│
├── dashboard/
│   ├── StatsCard
│   ├── ProgressCard
│   └── TaskOverview
│
├── projects/
│   ├── ProjectCard
│   ├── ProjectHeader
│   ├── ProjectProgress
│   └── ProjectMembers
│
├── tasks/
│   ├── TaskCard
│   ├── TaskDetails
│   ├── SubtaskList
│   ├── TaskComments
│   └── TaskActivity
│
├── submissions/
│   ├── SubmissionCard
│   ├── SubmissionViewer
│   └── ReviewPanel
│
├── chat/
│   ├── ChatWindow
│   ├── MessageList
│   └── MessageInput
│
└── notifications/
    └── NotificationList
```

---

# State Management

Client state may include:

* Current user
* Current workspace
* Current project
* Notifications
* Messages
* UI state
* Modal state
* Filters
* Search state

Server state includes:

* Projects
* Tasks
* Subtasks
* Members
* Comments
* Submissions
* Activity
* Analytics

The frontend should avoid duplicating server state unnecessarily.

---

# API Communication

The frontend communicates with the Express backend using REST APIs.

Example:

```text
GET /api/projects
GET /api/projects/:id
POST /api/projects
PATCH /api/projects/:id
DELETE /api/projects/:id
```

Tasks:

```text
GET /api/tasks
POST /api/tasks
PATCH /api/tasks/:id
DELETE /api/tasks/:id
```

Subtasks:

```text
POST /api/tasks/:taskId/subtasks
PATCH /api/subtasks/:id
DELETE /api/subtasks/:id
```

Submissions:

```text
POST /api/tasks/:taskId/submissions
GET /api/tasks/:taskId/submissions
POST /api/submissions/:id/review
```

---

# Error Handling

The frontend should display useful error states.

Examples:

```text
Unable to load project.

Try again
```

or:

```text
You don't have permission to access this project.
```

or:

```text
File upload failed.
Please try again.
```

Avoid exposing raw backend errors directly to users.

---

# Loading States

Every asynchronous operation should have a loading state.

Examples:

```text
Loading project...

Uploading document...

Submitting for review...

Saving changes...

Sending message...
```

Skeleton loaders should be used for major page content where appropriate.

---

# Responsive Design

Nexus should support:

* Desktop
* Laptop
* Tablet
* Mobile

The primary workspace experience is optimized for desktop because project management involves dashboards, tables, task boards, and file management.

Mobile should still support:

* Viewing tasks
* Updating task status
* Completing subtasks
* Comments
* Notifications
* Messaging
* Basic project monitoring

---

# Security Considerations

Frontend security features include:

* Protected routes
* Permission-aware UI
* Secure API communication
* Input validation
* Safe file upload interfaces
* Session expiration handling
* Logout
* Error handling

However:

> Frontend permissions are only for user experience. The backend must independently enforce every permission.

Never rely on:

```javascript
if (user.role === "admin") {
   // security-sensitive action
}
```

as the actual security mechanism.

The backend must verify the user's role and project membership.

---

# Environment Variables

Example:

```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api
NEXT_PUBLIC_SOCKET_URL=http://localhost:5000
```

Production:

```env
NEXT_PUBLIC_API_URL=https://api.example.com/api
NEXT_PUBLIC_SOCKET_URL=https://api.example.com
```

Never expose private backend secrets through `NEXT_PUBLIC_*` variables.

---

# Installation

Clone the repository:

```bash
git clone <frontend-repository-url>
cd nexus-frontend
```

Install dependencies:

```bash
npm install
```

Create:

```text
.env.local
```

Add the required environment variables.

Start development:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

---

# Production Build

Create a production build:

```bash
npm run build
```

Run production:

```bash
npm start
```

---

# Recommended Folder Structure

```text
nexus-frontend/
│
├── app/
├── components/
├── hooks/
├── lib/
├── services/
├── context/
├── utils/
├── public/
├── styles/
│
├── .env.local
├── package.json
├── next.config.mjs
└── README.md
```

---

# Development Principles

### 1. Keep components reusable

Avoid putting the entire application inside one page component.

### 2. Keep API logic separate

API requests should be placed inside services or dedicated API utilities.

### 3. Keep permissions explicit

The UI should clearly communicate what a user can and cannot do.

### 4. Preserve server authority

Never treat frontend checks as security.

### 5. Give users feedback

Every important action should provide:

* Loading state
* Success state
* Error state

### 6. Make real-time updates predictable

When another user changes a project, task, comment, or message, connected users should receive the appropriate update.

---

# Future Improvements

Possible future frontend features include:

* Drag-and-drop Kanban boards
* Calendar view
* Gantt charts
* Advanced project analytics
* Global search
* Command palette
* Rich text editor
* Document preview
* File version comparison
* Mentions
* Reactions
* Voice/video meetings
* AI project summaries
* AI task suggestions
* Advanced reporting
* Custom dashboards

---

# Project Philosophy

Nexus is not intended to be only a task manager.

It is designed around the complete project lifecycle:

```text
PLAN
 ↓
ASSIGN
 ↓
EXECUTE
 ↓
TRACK
 ↓
SUBMIT
 ↓
REVIEW
 ↓
APPROVE
 ↓
DOCUMENT
 ↓
COMMUNICATE
```

The frontend provides the interface that makes this workflow visible and usable to every participant in a project.











2. Backend README — nexus-backend/README.md


# Nexus — Backend

> RESTful API and real-time collaboration backend for the Nexus project management and collaborative workspace platform.

The Nexus backend provides authentication, authorization, workspace management, team management, project management, task execution, progress tracking, file submissions, reviews, notifications, messaging, activity tracking, analytics, and real-time communication.

The backend is built with Express.js and is responsible for all business logic, data validation, security, authorization, persistence, and real-time event processing.

---

# Table of Contents

* [Overview](#overview)
* [Backend Responsibilities](#backend-responsibilities)
* [Technology Stack](#technology-stack)
* [Architecture](#architecture)
* [Core Domain Model](#core-domain-model)
* [Authentication](#authentication)
* [Authorization](#authorization)
* [Workspace Management](#workspace-management)
* [Team Management](#team-management)
* [Project Management](#project-management)
* [Task Management](#task-management)
* [Subtask System](#subtask-system)
* [Progress Calculation](#progress-calculation)
* [Deliverable System](#deliverable-system)
* [Review System](#review-system)
* [Activity Logging](#activity-logging)
* [Comments](#comments)
* [Notifications](#notifications)
* [Messaging](#messaging)
* [Real-Time Architecture](#real-time-architecture)
* [File Management](#file-management)
* [Project Knowledge Base](#project-knowledge-base)
* [Analytics](#analytics)
* [Search](#search)
* [Database Design](#database-design)
* [API Structure](#api-structure)
* [API Endpoints](#api-endpoints)
* [Middleware](#middleware)
* [Validation](#validation)
* [Error Handling](#error-handling)
* [Security](#security)
* [Environment Variables](#environment-variables)
* [Installation](#installation)
* [Development](#development)
* [Production](#production)
* [Recommended Folder Structure](#recommended-folder-structure)
* [API Response Format](#api-response-format)
* [Development Principles](#development-principles)
* [Future Improvements](#future-improvements)

---

# Overview

Nexus is a collaborative workspace platform that allows multiple teams to work on multiple projects while maintaining controlled access to project information.

The backend manages the relationship between:

```text
Users
 ↓
Workspaces
 ↓
Teams
 ↓
Projects
 ↓
Tasks
 ↓
Subtasks
 ↓
Deliverables
 ↓
Reviews
```

It also manages:

```text
Comments
Messages
Notifications
Activity Logs
Attachments
Analytics
```

---

# Backend Responsibilities

The backend is responsible for:

* User registration
* Login
* Password hashing
* JWT authentication
* Role-based authorization
* Workspace management
* Team management
* Project management
* Project membership
* Task assignment
* Subtask management
* Progress calculation
* File uploads
* Deliverable submissions
* Review workflow
* Comments
* Activity logs
* Notifications
* Direct messages
* Workspace channels
* Real-time events
* Analytics
* Search
* Database operations
* Security
* Error handling

---

# Technology Stack

| Technology                         | Purpose                   |
| ---------------------------------- | ------------------------- |
| Node.js                            | Runtime                   |
| Express.js                         | HTTP framework            |
| PostgreSQL                         | Relational database       |
| Prisma / Sequelize                 | ORM                       |
| JWT                                | Authentication            |
| bcrypt                             | Password hashing          |
| Zod                                | Validation                |
| Socket.IO                          | Real-time communication   |
| Multer                             | File upload handling      |
| Cloudinary / S3-compatible storage | File storage              |
| dotenv                             | Environment configuration |
| Helmet                             | Security headers          |
| CORS                               | Cross-origin access       |
| express-rate-limit                 | Rate limiting             |

---

# Architecture

The backend follows a layered architecture:

```text
Client
  ↓
Routes
  ↓
Middleware
  ↓
Controllers
  ↓
Services
  ↓
Database
```

For example:

```text
POST /api/tasks
       ↓
Authentication Middleware
       ↓
Authorization Middleware
       ↓
Validation Middleware
       ↓
Task Controller
       ↓
Task Service
       ↓
Database
       ↓
Response
```

---

# Core Domain Model

The main entities are:

```text
User
Workspace
WorkspaceMember
Team
TeamMember
Project
ProjectMember
Task
TaskAssignee
Subtask
Submission
Review
Attachment
Comment
ActivityLog
Notification
Conversation
Message
Channel
KnowledgeBaseDocument
```

---

# Authentication

Nexus uses JWT-based authentication.

Authentication flow:

```text
User
 ↓
Register/Login
 ↓
Express API
 ↓
Validate credentials
 ↓
Generate JWT
 ↓
Client
```

For protected requests:

```text
Client
 ↓
Authorization: Bearer <token>
 ↓
Auth Middleware
 ↓
Verify JWT
 ↓
Attach user to req.user
 ↓
Controller
```

Example:

```http
Authorization: Bearer eyJhbGciOi...
```

---

# Password Security

Passwords must never be stored as plain text.

Registration:

```text
Password
   ↓
bcrypt
   ↓
Password Hash
   ↓
Database
```

Login:

```text
Password
   ↓
bcrypt.compare()
   ↓
Stored Hash
   ↓
Authentication Result
```

---

# Authorization

Authentication answers:

> Who are you?

Authorization answers:

> What are you allowed to do?

Nexus uses role and resource-based authorization.

Example:

```text
Workspace Owner
    ↓
Can manage workspace

Project Manager
    ↓
Can manage project

Member
    ↓
Can perform assigned work

Viewer
    ↓
Read-only
```

---

# Project-Level Authorization

Being a workspace member does not automatically give access to every project.

Example:

```text
Workspace
│
├── Team Alpha
│   └── Project A
│
└── Team Beta
    └── Project B
```

A Team Beta user requesting:

```http
GET /api/projects/project-a
```

should receive:

```http
403 Forbidden
```

unless they are explicitly a member/collaborator of Project A or have a workspace-level administrative permission.

---

# Workspace Management

Workspace functionality includes:

* Create workspace
* Update workspace
* Delete workspace
* Invite members
* Remove members
* Change member roles
* List members
* Create teams
* Workspace settings

Example:

```http
POST /api/workspaces
GET /api/workspaces
GET /api/workspaces/:id
PATCH /api/workspaces/:id
DELETE /api/workspaces/:id
```

---

# Team Management

Teams belong to workspaces.

Example:

```text
Workspace
│
├── Team Alpha
├── Team Beta
└── Team Gamma
```

Operations:

```http
POST /api/workspaces/:workspaceId/teams
GET /api/workspaces/:workspaceId/teams
GET /api/teams/:teamId
PATCH /api/teams/:teamId
DELETE /api/teams/:teamId
```

Team members can be added or removed.

---

# Project Management

Projects belong to workspaces and may be associated with teams.

Project data includes:

```text
Project
├── id
├── workspace_id
├── team_id
├── name
├── description
├── manager_id
├── status
├── start_date
├── deadline
└── created_at
```

Operations:

```http
POST /api/projects
GET /api/projects
GET /api/projects/:id
PATCH /api/projects/:id
DELETE /api/projects/:id
```

---

# Project Membership

Projects have their own membership system.

Example:

```text
Project Alpha

Members:
Philip       → Manager
Sarah        → Member
John         → Member
David        → Collaborator
```

David could belong to another team while still having access to this specific project.

This provides cross-team collaboration without exposing unrelated projects.

---

# Task Management

Tasks represent units of work.

Task fields may include:

```text
id
project_id
title
description
priority
status
due_date
created_by
created_at
updated_at
```

Example endpoint:

```http
POST /api/projects/:projectId/tasks
GET /api/projects/:projectId/tasks
GET /api/tasks/:taskId
PATCH /api/tasks/:taskId
DELETE /api/tasks/:taskId
```

---

# Task Status

Recommended task states:

```text
ASSIGNED
IN_PROGRESS
SUBMITTED
UNDER_REVIEW
CHANGES_REQUESTED
APPROVED
BLOCKED
```

`OVERDUE` should normally be derived from the deadline rather than stored as a permanent status.

Example:

```text
status = IN_PROGRESS
due_date = yesterday
```

The API can return:

```text
is_overdue = true
```

---

# Task Assignment

A task can have:

* Primary assignee
* Collaborators

Example:

```text
Task:
Create Project Proposal

Primary:
Philip

Collaborators:
Sarah
John
```

The backend verifies that assigned users have appropriate project access.

---

# Subtask System

Subtasks break tasks into measurable work.

Example:

```text
Task
│
├── Find sources
├── Research benefits
├── Research disadvantages
├── Write report
└── Add citations
```

Each subtask may contain:

```text
id
task_id
title
description
weight
status
assignee_id
created_at
completed_at
```

---

# Progress Calculation

Progress can be calculated using weighted subtasks.

Example:

```text
Find sources             10%
Benefits                 15%
Disadvantages            15%
Student effects          15%
Write report             30%
Citations                15%
```

Total:

```text
100%
```

If these are completed:

```text
Find sources
Benefits
Disadvantages
```

Progress:

```text
10 + 15 + 15 = 40%
```

The backend calculates and returns:

```json
{
  "progress": 40
}
```

---

# Project Progress

Project progress can be calculated from task progress.

For more accurate reporting, tasks can also have weights.

Example:

```text
Research             20%
Backend              30%
Frontend              30%
Testing               10%
Documentation         10%
```

The project progress is then calculated using the weighted task progress.

This prevents five tiny tasks from having the same impact as one major task.

---

# Remaining Work

The backend can expose:

```text
total_tasks
completed_tasks
in_progress_tasks
remaining_tasks
overdue_tasks
```

Example:

```json
{
  "totalTasks": 20,
  "completedTasks": 12,
  "remainingTasks": 8
}
```

Subtask-level remaining work can also be calculated.

---

# Deliverable System

A deliverable represents the actual output of a task.

Example:

```text
Task:
Research AI in Education

Deliverable:
AI-Education-Research.pdf
```

A task can contain multiple submission versions.

```text
Submission v1
   ↓
Changes Requested
   ↓
Submission v2
   ↓
Approved
```

Previous versions should remain available for audit purposes.

---

# Submission Workflow

```text
IN_PROGRESS
     ↓
SUBMITTED
     ↓
UNDER_REVIEW
     ↓
 ┌───────────────┐
 ↓               ↓
APPROVED    CHANGES_REQUESTED
                 ↓
            IN_PROGRESS
```

The backend controls these transitions.

Clients should not be able to arbitrarily change a task from:

```text
IN_PROGRESS
```

to:

```text
APPROVED
```

without satisfying the appropriate permission rules.

---

# Review System

A review contains:

```text
submission_id
reviewer_id
decision
feedback
created_at
```

Possible decisions:

```text
APPROVED
CHANGES_REQUESTED
```

Example:

```json
{
  "decision": "CHANGES_REQUESTED",
  "feedback": "Please add citations to sections 2 and 3."
}
```

The review action generates:

* Activity event
* Notification
* Status update
* Real-time update

---

# Activity Logging

The backend maintains an append-only activity log.

Example:

```text
activity_logs

id
actor_id
workspace_id
project_id
task_id
event_type
metadata
created_at
```

Events can include:

```text
TASK_CREATED
TASK_ASSIGNED
TASK_STARTED
SUBTASK_COMPLETED
FILE_UPLOADED
COMMENT_CREATED
SUBMISSION_CREATED
REVIEW_CREATED
TASK_APPROVED
CHANGES_REQUESTED
PROJECT_CREATED
MEMBER_INVITED
```

Example:

```json
{
  "event": "SUBTASK_COMPLETED",
  "actor": "Philip",
  "task": "Research AI",
  "subtask": "Find 5 academic sources"
}
```

---

# Comments

Comments can belong to:

* Projects
* Tasks
* Submissions
* Discussions

Example:

```http
POST /api/tasks/:taskId/comments
GET /api/tasks/:taskId/comments
PATCH /api/comments/:commentId
DELETE /api/comments/:commentId
```

Comments can support:

* Mentions
* Replies
* Editing
* Deletion
* Timestamps

---

# Notifications

Notifications are generated by backend events.

Examples:

```text
TASK_ASSIGNED
COMMENT_MENTION
SUBMISSION_RECEIVED
REVIEW_COMPLETED
CHANGES_REQUESTED
PROJECT_INVITATION
MESSAGE_RECEIVED
DEADLINE_REMINDER
```

Notification structure:

```text
id
user_id
type
title
message
resource_type
resource_id
read
created_at
```

---

# Messaging

Nexus supports communication at multiple levels.

## Workspace communication

```text
Workspace
 ├── #general
 ├── #announcements
 └── #project-help
```

## Project communication

```text
Project
 └── Project Discussion
```

## Direct messaging

```text
User A
   ↕
User B
```

Communication permissions are independent from project permissions.

---

# Real-Time Architecture

Socket.IO handles real-time communication.

The backend can emit events such as:

```text
task.updated
task.created
subtask.updated
comment.created
submission.created
review.created
notification.created
message.created
project.updated
```

Example:

```text
User A
  │
  │ completes subtask
  ▼
Express API
  │
  ├── Database update
  │
  ├── Activity log
  │
  └── Socket.IO event
           │
           ▼
       User B
           │
           ▼
    Dashboard updates
```

---

# Socket Rooms

Rooms can represent:

```text
workspace:<workspaceId>
project:<projectId>
task:<taskId>
conversation:<conversationId>
```

Example:

```javascript
socket.join(`project:${projectId}`);
```

When a task changes:

```javascript
io.to(`project:${projectId}`).emit("task.updated", task);
```

Only users connected to that project room receive the event.

---

# File Management

Files can be uploaded as:

* Task attachments
* Deliverables
* Project documents
* Knowledge-base documents

The backend should validate:

* File type
* File size
* User permission
* Resource ownership/access

Recommended storage:

```text
Application Server
        ↓
Object/File Storage
        ↓
Stored File URL
        ↓
Database
```

The database should store metadata rather than large binary files where possible.

Example:

```text
attachments

id
uploaded_by
project_id
task_id
file_name
file_url
file_type
file_size
created_at
```

---

# Project Knowledge Base

When a deliverable is approved, the backend can optionally create a knowledge-base entry.

Example:

```text
Submission
   ↓
Approved
   ↓
Knowledge Base Document
```

This allows projects to maintain a reliable collection of approved information.

---

# Analytics

The backend provides aggregated project statistics.

Examples:

```text
Total Tasks
Completed Tasks
Remaining Tasks
Overdue Tasks
Blocked Tasks
Project Progress
Submission Count
Approval Rate
Team Workload
Activity Count
```

Example:

```json
{
  "totalTasks": 25,
  "completedTasks": 12,
  "inProgressTasks": 7,
  "underReview": 3,
  "blocked": 2,
  "remaining": 13,
  "progress": 72
}
```

---

# Team Workload

Workload should not be measured simply by task count.

For example:

```text
Philip:
2 large tasks

Sarah:
8 small tasks
```

Counting tasks alone could make Sarah appear more overloaded even if Philip's two tasks contain significantly more work.

Nexus can therefore use:

* Task weights
* Estimated effort
* Subtask weights
* Deadlines

to provide a more useful workload representation.

---

# Search

Global search can cover:

```text
Projects
Tasks
Users
Files
Comments
Knowledge Base
```

Example:

```http
GET /api/search?q=artificial+intelligence
```

Results should respect the user's permissions.

A user must never receive search results for a private project they cannot access.

---

# Database Design

Recommended relational database:

**PostgreSQL**

Core relationships:

```text
users
  │
  ├── workspace_members
  │
  ├── team_members
  │
  └── project_members

workspaces
  │
  ├── teams
  └── projects

projects
  │
  ├── tasks
  ├── project_members
  ├── comments
  ├── attachments
  ├── activity_logs
  └── knowledge_base_documents

tasks
  │
  ├── subtasks
  ├── assignees
  ├── comments
  ├── attachments
  └── submissions

submissions
  │
  └── reviews
```

---

# Suggested Database Tables

```text
users
workspaces
workspace_members

teams
team_members

projects
project_members

tasks
task_assignees
subtasks

attachments
submissions
submission_files
reviews

comments
comment_replies

activity_logs

notifications

conversations
conversation_members
messages

channels
channel_members

knowledge_base_documents
```

---

# API Structure

The REST API follows resource-based URLs.

```text
/api/auth
/api/users
/api/workspaces
/api/teams
/api/projects
/api/tasks
/api/subtasks
/api/submissions
/api/reviews
/api/comments
/api/notifications
/api/messages
/api/files
/api/activity
/api/search
/api/analytics
```

---

# Authentication Endpoints

```http
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
POST /api/auth/refresh
POST /api/auth/forgot-password
POST /api/auth/reset-password
GET  /api/auth/me
```

---

# Workspace Endpoints

```http
POST   /api/workspaces
GET    /api/workspaces
GET    /api/workspaces/:id
PATCH  /api/workspaces/:id
DELETE /api/workspaces/:id

GET    /api/workspaces/:id/members
POST   /api/workspaces/:id/members
DELETE /api/workspaces/:id/members/:userId
```

---

# Team Endpoints

```http
POST   /api/workspaces/:workspaceId/teams
GET    /api/workspaces/:workspaceId/teams

GET    /api/teams/:teamId
PATCH  /api/teams/:teamId
DELETE /api/teams/:teamId

POST   /api/teams/:teamId/members
DELETE /api/teams/:teamId/members/:userId
```

---

# Project Endpoints

```http
POST   /api/projects
GET    /api/projects
GET    /api/projects/:id
PATCH  /api/projects/:id
DELETE /api/projects/:id
```

Members:

```http
GET    /api/projects/:id/members
POST   /api/projects/:id/members
DELETE /api/projects/:id/members/:userId
```

---

# Task Endpoints

```http
POST   /api/projects/:projectId/tasks
GET    /api/projects/:projectId/tasks

GET    /api/tasks/:taskId
PATCH  /api/tasks/:taskId
DELETE /api/tasks/:taskId
```

Assignment:

```http
POST   /api/tasks/:taskId/assignees
DELETE /api/tasks/:taskId/assignees/:userId
```

---

# Subtask Endpoints

```http
POST   /api/tasks/:taskId/subtasks
GET    /api/tasks/:taskId/subtasks

PATCH  /api/subtasks/:subtaskId
DELETE /api/subtasks/:subtaskId
```

---

# Submission Endpoints

```http
POST /api/tasks/:taskId/submissions
GET  /api/tasks/:taskId/submissions

GET  /api/submissions/:submissionId
```

---

# Review Endpoints

```http
POST /api/submissions/:submissionId/review
GET  /api/submissions/:submissionId/reviews
```

---

# Comment Endpoints

```http
GET    /api/tasks/:taskId/comments
POST   /api/tasks/:taskId/comments

PATCH  /api/comments/:commentId
DELETE /api/comments/:commentId
```

---

# Notification Endpoints

```http
GET   /api/notifications
PATCH /api/notifications/:id/read
PATCH /api/notifications/read-all
```

---

# Messaging Endpoints

```http
GET  /api/conversations
POST /api/conversations

GET  /api/conversations/:id/messages
POST /api/conversations/:id/messages
```

Real-time messages should primarily be delivered through Socket.IO while REST can be used for fetching historical messages.

---

# Activity Endpoints

```http
GET /api/projects/:projectId/activity
GET /api/tasks/:taskId/activity
GET /api/workspaces/:workspaceId/activity
```

---

# Analytics Endpoints

```http
GET /api/projects/:projectId/analytics
GET /api/workspaces/:workspaceId/analytics
GET /api/teams/:teamId/analytics
```

---

# Middleware

Recommended middleware:

```text
auth.middleware.js
role.middleware.js
projectAccess.middleware.js
workspaceAccess.middleware.js
validate.middleware.js
upload.middleware.js
rateLimit.middleware.js
error.middleware.js
logger.middleware.js
```

---

# Authentication Middleware

Responsible for:

1. Reading the Authorization header
2. Extracting the JWT
3. Verifying the token
4. Identifying the user
5. Attaching the user to `req.user`

Example:

```text
Request
  ↓
Authorization Header
  ↓
JWT Verification
  ↓
req.user
  ↓
Next Middleware
```

---

# Authorization Middleware

Authorization checks whether the authenticated user has permission to perform an action.

Example:

```text
Authenticated?
     ↓
   YES
     ↓
Project Member?
     ↓
   YES
     ↓
Correct Role?
     ↓
   YES
     ↓
Allow Request
```

---

# Validation Middleware

Request data should be validated before reaching business logic.

For example:

```text
POST /api/tasks
```

may require:

```text
title
description
priority
dueDate
assignee
```

Invalid requests should return:

```http
400 Bad Request
```

with a structured error response.

---

# Rate Limiting

Rate limiting controls how many requests a client can make within a specified period.

Example:

```text
100 requests / 15 minutes
```

Authentication routes should generally have stricter limits than ordinary read operations.

This helps reduce:

* Brute-force attempts
* API abuse
* Excessive traffic
* Accidental request floods

---

# Error Handling

The backend should use centralized error handling.

Example:

```json
{
  "success": false,
  "message": "Project not found"
}
```

Common HTTP statuses:

```text
200 OK
201 Created
204 No Content
400 Bad Request
401 Unauthorized
403 Forbidden
404 Not Found
409 Conflict
422 Unprocessable Entity
429 Too Many Requests
500 Internal Server Error
```

---

# Security

The backend should implement:

### Password security

* bcrypt hashing
* No plain-text passwords

### Authentication

* JWT
* Token expiration
* Secure session handling

### Authorization

* Role-based access
* Resource-level access checks

### Input validation

* Zod
* Sanitization where necessary

### HTTP security

* Helmet
* CORS configuration

### Rate limiting

Protect sensitive endpoints.

### File security

Validate:

* File type
* File size
* Upload permissions

### Database security

* Parameterized queries/ORM
* Environment-based credentials
* Least-privilege database access

---

# CORS

The backend should only allow trusted frontend origins.

Development:

```env
CLIENT_URL=http://localhost:3000
```

Production:

```env
CLIENT_URL=https://your-frontend-domain.com
```

CORS should not simply be configured as:

```javascript
origin: "*"
```

when authenticated requests are involved.

---

# Environment Variables

Example:

```env
PORT=5000

DATABASE_URL=postgresql://user:password@localhost:5432/nexus

JWT_SECRET=your_secret
JWT_EXPIRES_IN=7d

SALT_ROUNDS=10

CLIENT_URL=http://localhost:3000

UPLOAD_MAX_SIZE=10485760
```

If using object storage:

```env
STORAGE_PROVIDER=cloudinary

CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

Socket configuration:

```env
SOCKET_CORS_ORIGIN=http://localhost:3000
```

Secrets must never be committed to Git.

---

# Installation

Clone the repository:

```bash
git clone <backend-repository-url>
cd nexus-backend
```

Install dependencies:

```bash
npm install
```

Create:

```text
.env
```

Configure the required environment variables.

Run database migrations:

```bash
npm run migrate
```

Start development:

```bash
npm run dev
```

Server:

```text
http://localhost:5000
```

---

# Production

Build/start according to the project's Node.js deployment configuration.

Example:

```bash
npm start
```

The production environment should provide:

* Production database
* Secure JWT secret
* Production frontend URL
* Secure file storage
* HTTPS
* Proper logging
* Error monitoring

---

# Recommended Folder Structure

```text
nexus-backend/
│
├── src/
│   │
│   ├── config/
│   │   ├── database.js
│   │   └── environment.js
│   │
│   ├── controllers/
│   │   ├── auth.controller.js
│   │   ├── workspace.controller.js
│   │   ├── team.controller.js
│   │   ├── project.controller.js
│   │   ├── task.controller.js
│   │   ├── submission.controller.js
│   │   ├── review.controller.js
│   │   ├── message.controller.js
│   │   └── notification.controller.js
│   │
│   ├── services/
│   │   ├── auth.service.js
│   │   ├── project.service.js
│   │   ├── task.service.js
│   │   ├── submission.service.js
│   │   ├── notification.service.js
│   │   └── analytics.service.js
│   │
│   ├── routes/
│   │   ├── auth.routes.js
│   │   ├── workspace.routes.js
│   │   ├── team.routes.js
│   │   ├── project.routes.js
│   │   ├── task.routes.js
│   │   ├── submission.routes.js
│   │   ├── review.routes.js
│   │   ├── message.routes.js
│   │   └── notification.routes.js
│   │
│   ├── middleware/
│   │   ├── auth.middleware.js
│   │   ├── role.middleware.js
│   │   ├── access.middleware.js
│   │   ├── validate.middleware.js
│   │   ├── upload.middleware.js
│   │   ├── rateLimit.middleware.js
│   │   └── error.middleware.js
│   │
│   ├── validators/
│   │   ├── auth.validator.js
│   │   ├── project.validator.js
│   │   └── task.validator.js
│   │
│   ├── models/
│   │
│   ├── sockets/
│   │   ├── index.js
│   │   ├── project.socket.js
│   │   ├── task.socket.js
│   │   └── chat.socket.js
│   │
│   ├── utils/
│   │
│   ├── app.js
│   └── server.js
│
├── migrations/
├── tests/
├── .env
├── package.json
└── README.md
```

---

# API Response Format

Successful response:

```json
{
  "success": true,
  "message": "Task created successfully",
  "data": {
    "id": "task_123",
    "title": "Research AI"
  }
}
```

Error response:

```json
{
  "success": false,
  "message": "You do not have permission to access this project"
}
```

Validation error:

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": {
    "title": "Title is required"
  }
}
```

---

# Important Business Rules

### Rule 1 — Workspace membership does not equal project membership

A workspace user cannot automatically access every project.

### Rule 2 — Project membership grants project access

A user must be a project member, authorized collaborator, or authorized workspace administrator.

### Rule 3 — Messaging does not grant project access

Users can communicate without gaining access to private projects.

### Rule 4 — Subtasks measure progress

Subtasks generally do not require formal review.

### Rule 5 — Deliverables are reviewed

The main task deliverable goes through the submission/review workflow.

### Rule 6 — Only authorized reviewers can approve work

A regular member cannot approve their own submission.

### Rule 7 — Activity is append-only

Activity records should not be casually modified because they provide an audit trail.

### Rule 8 — Backend controls authorization

Frontend permission checks are not security controls.

### Rule 9 — Search respects permissions

A user must not discover private projects through search.

### Rule 10 — Approved work can enter the knowledge base

Approved deliverables can become official project documentation.

---

# Example Complete Workflow

Consider a school project:

```text
Workspace:
Blockfuse Student Workspace

Team:
Team Alpha

Project:
AI in Education Research
```

The Project Manager creates:

```text
Task:
Research Effects of AI on Education
```

The task is assigned to Philip.

Philip receives:

```text
Notification:
You have been assigned a new task.
```

Philip starts the task.

The backend records:

```text
TASK_STARTED
```

Philip completes:

```text
✓ Find 5 academic sources
✓ Research benefits
✓ Research disadvantages
```

The backend updates the progress.

```text
Progress: 40%
```

Philip uploads:

```text
ai-research.pdf
```

The backend records:

```text
FILE_UPLOADED
```

Philip completes the remaining subtasks.

```text
Progress: 100%
```

Philip submits the deliverable.

```text
SUBMITTED
```

The Project Manager receives:

```text
Notification:
Philip submitted "Research Effects of AI on Education".
```

The manager reviews the document.

If changes are needed:

```text
CHANGES_REQUESTED
```

Feedback:

```text
"Please add citations to sections 2 and 3."
```

Philip updates the document and submits version 2.

The manager approves it.

```text
APPROVED
```

The backend:

```text
Updates task
Creates review
Creates activity log
Creates notification
Emits Socket.IO event
Optionally creates knowledge-base document
```

The project dashboard updates in real time.

---

# Development Principles

### Separation of concerns

Routes should define endpoints.

Controllers should handle HTTP requests.

Services should contain business logic.

Models/database layer should handle persistence.

Middleware should handle cross-cutting concerns.

---

### Backend authority

Never trust the client.

The client can send:

```json
{
  "role": "OWNER"
}
```

but the backend must determine whether the authenticated user is actually allowed to perform the operation.

---

### Resource-level authorization

Don't only check:

```text
Is the user logged in?
```

Also check:

```text
Does the user belong to this workspace?

Does the user have access to this project?

Can this role perform this action?
```

---

### Transactions

Operations involving multiple database changes should use database transactions where appropriate.

For example, approving a submission may involve:

```text
Update submission
       +
Update task
       +
Create review
       +
Create activity
       +
Create notification
```

These operations should be handled safely so that the database does not end up in an inconsistent state.

---

# Future Improvements

Potential backend features:

* Advanced RBAC
* Custom workspace roles
* Task dependencies
* Milestones
* Calendar integration
* Gantt data
* Advanced analytics
* Audit reports
* Email notifications
* Push notifications
* Webhooks
* External integrations
* GitHub integration
* Google Drive integration
* AI project summaries
* AI task breakdown
* AI risk detection
* Advanced search
* Document version comparison
* Video meetings
* Voice communication

---

# Backend Philosophy

The Nexus backend is built around one central principle:

> Every piece of project work should have a clear owner, measurable progress, an auditable history, and a controlled path from assignment to completion.

The backend therefore connects:

```text
AUTHENTICATION
       ↓
AUTHORIZATION
       ↓
WORKSPACES
       ↓
TEAMS
       ↓
PROJECTS
       ↓
TASKS
       ↓
SUBTASKS
       ↓
PROGRESS
       ↓
DELIVERABLES
       ↓
REVIEWS
       ↓
KNOWLEDGE BASE
```

while simultaneously supporting:

```text
REAL-TIME COMMUNICATION
        +
NOTIFICATIONS
        +
ACTIVITY TRACKING
        +
ANALYTICS
```

This allows Nexus to function as a complete collaborative project execution platform rather than simply a CRUD-based task management application.






//so , structure the backend this way, store clients in this category on mango db, the person who create the account can create a workspace his role then he can manage the workspace. he can set a team lead. the team lead can maitain the project, share task, 