export type ParticipantRole = "user" | "assistant" | "system";

export interface ConversationMetadata {
  readonly session_id: string;
  readonly created_at: string;
  readonly label?: string | null;
}

export interface RealtimeSessionCredentials {
  readonly session_id: string;
  readonly client_secret: string;
  readonly expires_at: string;
  readonly model: string;
}

export interface DimensionScore {
  readonly dimension: "length" | "questions" | "sentiment" | "flow";
  readonly score: number;
  readonly rationale: string;
}

export interface EvaluationResult {
  readonly overall_score: number;
  readonly dimensions: DimensionScore[];
}

export interface LlmDimensionJudgment {
  readonly dimension: DimensionScore["dimension"];
  readonly score: number;
  readonly rating: "excellent" | "good" | "fair" | "poor";
  readonly rationale: string;
}

export interface LlmEvaluationResult {
  readonly overall_score: number;
  readonly rating: "excellent" | "good" | "fair" | "poor";
  readonly summary: string;
  readonly dimensions: LlmDimensionJudgment[];
  readonly action_items: string[];
  readonly generated_at: string;
}

export interface CombinedEvaluationResult {
  readonly heuristics: EvaluationResult;
  readonly llm: LlmEvaluationResult;
  readonly generated_at: string;
}

export type CharacterDifficulty = "beginner" | "intermediate" | "advanced";
export type FormalityLevel = "casual" | "professional" | "formal";
export type EnergyLevel = "low" | "medium" | "high";
export type OpennessLevel = "guarded" | "neutral" | "open";
export type CharacterMood = "irritated" | "neutral" | "curious" | "engaged";

export interface BasePersonality {
  readonly formality: FormalityLevel;
  readonly energy: EnergyLevel;
  readonly openness: OpennessLevel;
  readonly backstory: string;
}

export interface TopicFocus {
  readonly interest: string;
  readonly recent_project: string;
  readonly pain_point: string;
}

export interface PersonaSummary {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly scenario: string;
  readonly difficulty: CharacterDifficulty;
  readonly formality: FormalityLevel;
  readonly energy: EnergyLevel;
  readonly openness: OpennessLevel;
  readonly stress_level: number;
  readonly current_mood: CharacterMood;
  readonly topic_focus: TopicFocus;
}

export interface PatienceConfig {
  readonly starting_patience: number;
  readonly warning_threshold: number;
  readonly countdown_turns: number;
}

export interface CharacterSessionState {
  readonly session_id: string;
  readonly character_id: string;
  readonly stress_level: number;
  readonly patience_config: PatienceConfig;
  readonly current_patience: number;
  readonly current_mood: CharacterMood;
  readonly warning_turns_remaining: number | null;
  readonly turn_index: number;
  readonly is_in_warning_state: boolean;
}

export interface TurnMessage {
  readonly message_id: string;
  readonly role: Exclude<ParticipantRole, "system">;
  readonly utterance: string;
  readonly timestamp: string;
}

export interface ConversationTurn {
  readonly turn_id: string;
  readonly user: TurnMessage;
  readonly assistant: readonly TurnMessage[];
}

export interface ConversationTranscript {
  readonly metadata: ConversationMetadata;
  readonly turns: readonly ConversationTurn[];
}

export interface SessionMessage extends TurnMessage {
  readonly sequence: number;
  readonly final: boolean;
}

export interface DimensionScoreView {
  readonly dimension: string;
  readonly score: number;
  readonly rationale: string;
}

export interface TurnEvaluationView {
  readonly dimension_scores: readonly DimensionScoreView[];
  readonly patience_delta: number;
  readonly average_score: number;
  readonly previous_mood: CharacterMood;
  readonly new_mood: CharacterMood;
  readonly entered_warning: boolean;
  readonly exited_warning: boolean;
  readonly conversation_ended: boolean;
}

export type AssistantResponseSource = "llm" | "heuristic";

export interface TurnAnalysis {
  readonly evaluation: TurnEvaluationView;
  readonly combined_evaluation: CombinedEvaluationResult | null;
  readonly evaluation_failure_reason: string | null;
  readonly response_source: AssistantResponseSource;
  readonly response_failure_reason: string | null;
  readonly persona: PersonaSummary;
  readonly state: CharacterSessionState;
}

export interface SessionTurn {
  readonly turn_id: string;
  readonly user: SessionMessage;
  readonly assistant: readonly SessionMessage[];
  readonly opened_at: string;
  readonly closed_at: string | null;
  readonly analysis?: TurnAnalysis;
}

export interface SessionStartResponse {
  readonly session_id: string;
  readonly persona: PersonaSummary;
  readonly state: CharacterSessionState;
}

export interface TurnResponsePayload {
  readonly session_id: string;
  readonly assistant_message: TurnMessage;
  readonly state: CharacterSessionState;
  readonly persona: PersonaSummary;
  readonly evaluation: TurnEvaluationView;
  readonly combined_evaluation: CombinedEvaluationResult | null;
  readonly evaluation_failure_reason: string | null;
  readonly response_source: AssistantResponseSource;
  readonly response_failure_reason: string | null;
}
