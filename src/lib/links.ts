/**
 * Where each kind of item lives: its home page, opened with the item selected and its
 * form open. Anywhere else an item is shown (a scene on a shoot day, a location on a
 * task, a person on a call sheet), it links here. The home page reads ?open=<id> with
 * useOpenFromLink (src/lib/reveal.ts).
 */
const open = (id: string) => `?open=${encodeURIComponent(id)}`;

export const itemPath = {
  task: (projectId: string, id: string) => `/projects/${projectId}/tasks${open(id)}`,
  scene: (projectId: string, id: string) => `/projects/${projectId}/scenes${open(id)}`,
  character: (projectId: string, id: string) => `/projects/${projectId}/characters${open(id)}`,
  element: (projectId: string, id: string) => `/projects/${projectId}/elements${open(id)}`,
  shootDay: (projectId: string, id: string) => `/projects/${projectId}/shoot-days${open(id)}`,
  callSheet: (projectId: string, dayId: string) => `/projects/${projectId}/shoot-days/${dayId}`,
  location: (projectId: string, id: string) => `/projects/${projectId}/locations${open(id)}`,
  /** A person on a project: their line on the project's Team page (which links on to the company's People). */
  teamMember: (projectId: string, userId: string) => `/projects/${projectId}/team${open(userId)}`,
  /** A person in the company: their form on the company's People list. */
  person: (companyId: string, userId: string) => `/companies/${companyId}${open(userId)}`,
  /** A task category or tag: its form on the company's task settings page. */
  taskSetting: (companyId: string, id: string) => `/companies/${companyId}/task-settings${open(id)}`,
};
