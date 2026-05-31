import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Project,
  ProjectLevel,
  OutputType,
  FloorplanAnalysis,
  UploadedFile,
  Branding,
  FeedbackRound,
  PlanEdit,
} from '@/types/project';
import { v4 as uuidv4 } from 'uuid';

/**
 * Project store.
 *
 * Note: as soon as a name is entered on `/nieuw` we create a draft project
 * (`isDraft: true`). The draft is persisted to localStorage via the
 * `persist` middleware so users can close the tab and come back to where
 * they left off in the input phase. `isDraft` flips to false after Step 3
 * (input) completes.
 */
interface ProjectStore {
  project: Project | null;
  createProject: (name: string) => void;
  setLevel: (level: ProjectLevel) => void;
  setOutputCategory: (category: '2d' | '3d') => void;
  setOutputType: (type: OutputType) => void;
  setExampleId: (exampleId: string | null) => void;
  setBranding: (branding: Branding | null) => void;
  updateBranding: (patch: Partial<Branding>) => void;
  addFile: (file: UploadedFile) => void;
  setAnalysis: (analysis: FloorplanAnalysis) => void;
  setStatus: (status: Project['status']) => void;
  markDraftComplete: () => void;
  addFeedback: (round: Omit<FeedbackRound, 'id' | 'createdAt'>) => string;
  addEdits: (edits: Omit<PlanEdit, 'id' | 'createdAt'>[]) => void;
  reset: () => void;
}

const EMPTY_BRANDING: Branding = {
  primaryColor: null,
  secondaryColor: null,
  accentColor: null,
  logoDataUrl: null,
  notes: null,
};

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set) => ({
      project: null,

      createProject: (name) =>
        set({
          project: {
            id: uuidv4(),
            name,
            createdAt: new Date(),
            isDraft: true,
            level: null,
            outputCategory: null,
            outputType: null,
            exampleId: null,
            branding: null,
            files: [],
            analysis: null,
            status: 'niveau',
            feedback: [],
            edits: [],
          },
        }),

      setLevel: (level) =>
        set((state) => ({
          project: state.project ? { ...state.project, level } : null,
        })),

      setOutputCategory: (category) =>
        set((state) => ({
          project: state.project ? { ...state.project, outputCategory: category } : null,
        })),

      setOutputType: (type) =>
        set((state) => ({
          project: state.project ? { ...state.project, outputType: type } : null,
        })),

      setExampleId: (exampleId) =>
        set((state) => ({
          project: state.project ? { ...state.project, exampleId } : null,
        })),

      setBranding: (branding) =>
        set((state) => ({
          project: state.project ? { ...state.project, branding } : null,
        })),

      updateBranding: (patch) =>
        set((state) => {
          if (!state.project) return state;
          const current = state.project.branding ?? EMPTY_BRANDING;
          return {
            project: {
              ...state.project,
              branding: { ...current, ...patch },
            },
          };
        }),

      addFile: (file) =>
        set((state) => ({
          project: state.project
            ? { ...state.project, files: [...state.project.files, file] }
            : null,
        })),

      setAnalysis: (analysis) =>
        set((state) => ({
          project: state.project
            ? { ...state.project, analysis, status: 'validatie' }
            : null,
        })),

      setStatus: (status) =>
        set((state) => ({
          project: state.project ? { ...state.project, status } : null,
        })),

      markDraftComplete: () =>
        set((state) => ({
          project: state.project ? { ...state.project, isDraft: false } : null,
        })),

      addFeedback: (round) => {
        const id = uuidv4();
        set((state) => {
          if (!state.project) return state;
          if (state.project.feedback.length >= 5) return state;
          const next: FeedbackRound = {
            ...round,
            id,
            createdAt: new Date().toISOString(),
          };
          return {
            project: {
              ...state.project,
              feedback: [...state.project.feedback, next],
            },
          };
        });
        return id;
      },

      addEdits: (edits) =>
        set((state) => {
          if (!state.project) return state;
          const expanded: PlanEdit[] = edits.map((e) => ({
            ...e,
            id: uuidv4(),
            createdAt: new Date().toISOString(),
          }));
          return {
            project: {
              ...state.project,
              edits: [...state.project.edits, ...expanded],
            },
          };
        }),

      reset: () => set({ project: null }),
    }),
    {
      name: 'rendoo-project',
    }
  )
);
