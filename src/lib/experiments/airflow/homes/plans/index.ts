import type { HomePlan } from '../types';
import { house } from './house';
import { oneBedroom } from './oneBedroom';
import { studio } from './studio';
import { twoBedroom } from './twoBedroom';

/** The homes a visitor can pick, smallest first. */
export const plans: HomePlan[] = [studio, oneBedroom, twoBedroom, house];

/** The plan with this id, or undefined (a share link may carry anything). */
export const planById = (id: string): HomePlan | undefined => plans.find((plan) => plan.id === id);
