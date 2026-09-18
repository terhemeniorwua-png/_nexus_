import { UserIcon, UsersIcon, GraduationIcon } from "./AuthIcons";

export const PERSONAS = [
  {
    type: "personal",
    icon: UserIcon,
    title: "Welcome back",
    subtitle: "Sign in to your personal Nexus workspace",
    optionTitle: "Personal Account",
    optionRole: "For individuals",
    optionCopy: "A private workspace for your projects, notes, and tasks.",
    emailLabel: "Email address",
    emailPlaceholder: "you@example.com",
    accent: "text-indigo-300",
  },
  {
    type: "team",
    icon: UsersIcon,
    title: "Welcome back",
    subtitle: "Sign in to your team workspace",
    optionTitle: "Team",
    optionRole: "For teams & companies",
    optionCopy: "A shared workspace to plan, build, and ship together.",
    emailLabel: "Team email",
    emailPlaceholder: "you@yourcompany.com",
    accent: "text-sky-300",
    showWorkspace: true,
    workspaceLabel: "Workspace",
    workspacePlaceholder: "your-workspace",
    showJoinTeam: true,
  },
  {
    type: "institute",
    icon: GraduationIcon,
    title: "Welcome back",
    subtitle: "Access your institutional workspace",
    optionTitle: "Institute",
    optionRole: "For education & enterprise",
    optionCopy: "Managed workspaces for students, staff, and departments.",
    emailLabel: "Institutional email",
    emailPlaceholder: "you@university.edu",
    accent: "text-emerald-300",
    showSso: true,
  },
];

export function resolvePersona(type) {
  return PERSONAS.find((persona) => persona.type === type) || PERSONAS[0];
}