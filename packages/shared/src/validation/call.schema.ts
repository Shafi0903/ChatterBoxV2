import { z } from 'zod';
import { CallType } from '../types/call.types';

export const callInitiateSchema = z.object({
  conversationId: z.string().cuid(),
  type: z.nativeEnum(CallType),
});

export const callActionSchema = z.object({
  callId: z.string().cuid(),
});

export const callOfferSchema = z.object({
  callId: z.string().cuid(),
  sdp: z.object({
    type: z.string(),
    sdp: z.string(),
  }).passthrough(),
});

export const callAnswerSchema = z.object({
  callId: z.string().cuid(),
  sdp: z.object({
    type: z.string(),
    sdp: z.string(),
  }).passthrough(),
});

export const callIceCandidateSchema = z.object({
  callId: z.string().cuid(),
  candidate: z.object({
    candidate: z.string(),
  }).passthrough(),
});

export const callPaginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
});

export type CallInitiateInput = z.infer<typeof callInitiateSchema>;
export type CallActionInput = z.infer<typeof callActionSchema>;
export type CallOfferInput = z.infer<typeof callOfferSchema>;
export type CallAnswerInput = z.infer<typeof callAnswerSchema>;
export type CallIceCandidateInput = z.infer<typeof callIceCandidateSchema>;
export type CallPaginationQuery = z.infer<typeof callPaginationSchema>;
