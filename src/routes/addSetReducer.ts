export type Stage = "category" | "exercise" | "amount";

export interface AddSetState {
  stage: Stage;
  categoryId?: string;
  exerciseId?: string;
  weight: number;
  reps: number;
  touched: boolean;
}

export type AddSetAction =
  | { type: "pickCategory"; id: string }
  | { type: "pickExercise"; id: string }
  | { type: "setDefaults"; weight: number; reps: number }
  | { type: "back" }
  | { type: "adjustWeight"; delta: number }
  | { type: "adjustReps"; delta: number }
  | { type: "savedKeepExercise" };

export const initialAddSetState: AddSetState = {
  stage: "category",
  weight: 0,
  reps: 0,
  touched: false,
};

const clamp = (n: number, min: number) => (n < min ? min : n);
const roundHalf = (n: number) => Math.round(n * 2) / 2;

export function addSetReducer(state: AddSetState, action: AddSetAction): AddSetState {
  switch (action.type) {
    case "pickCategory":
      return { ...state, stage: "exercise", categoryId: action.id, exerciseId: undefined };
    case "pickExercise":
      return {
        ...state,
        stage: "amount",
        exerciseId: action.id,
        weight: 0,
        reps: 0,
        touched: false,
      };
    case "setDefaults":
      if (state.touched) return state;
      return { ...state, weight: action.weight, reps: action.reps };
    case "adjustWeight":
      return {
        ...state,
        weight: clamp(roundHalf(state.weight + action.delta), 0),
        touched: true,
      };
    case "adjustReps":
      return {
        ...state,
        reps: clamp(Math.round(state.reps + action.delta), 0),
        touched: true,
      };
    case "back":
      if (state.stage === "amount") return { ...state, stage: "exercise" };
      if (state.stage === "exercise")
        return { ...state, stage: "category", categoryId: undefined };
      return state;
    case "savedKeepExercise":
      return { ...state, touched: false };
    default:
      return state;
  }
}
