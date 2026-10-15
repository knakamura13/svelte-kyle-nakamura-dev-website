import type { RoomOpening } from '../homes/rooms';
import type { OpeningSpec } from '../homes/types';

/**
 * What the Dock says about an Opening, in words: how far it has travelled, how much of its frame that leaves open, and the most
 * of its frame it ever opens. The slider moves the travel (0 to 100%); what the air sees is the frame, which a window opens
 * only partly (a double-hung window passes at most half of its frame, a casement 80%). Plain data and strings, so a Node test can hold them.
 */

export interface OpeningReading {
	/** How far the door or window has travelled, whole percent of its travel. */
	travel: number;
	/** The part of its frame that is open now, whole percent. */
	frame: number;
	/** The most of its frame it opens, whole percent: what is open where its travel ends. */
	limit: number;
}

/** A fraction as a whole percent from 0 to 100; anything that is not a number reads as 0. */
const whole = (fraction: number) => (Number.isFinite(fraction) ? Math.round(Math.min(1, Math.max(0, fraction)) * 100) : 0);

/** `amount` is the Opening's setting, 0 to 1 of its travel. The frame share comes from the whole-percent travel, so the two numbers on screen always agree. */
export function openingReading(opening: Pick<OpeningSpec, 'maxOpen'>, amount: number): OpeningReading {
	const travel = whole(amount);
	return { travel, frame: Math.round(travel * opening.maxOpen), limit: whole(opening.maxOpen) };
}

/** An Opening's label in the list and to a screen reader: its name, and for a doorway the Room it leads to. */
export const openingLabel = ({ opening, to }: RoomOpening) => (to ? `${opening.name}, to ${to.name}` : opening.name);

const limitText = (reading: OpeningReading) => (reading.limit >= 100 ? 'It opens its whole frame.' : `It opens at most ${reading.limit}% of its frame.`);

/** The line under an Opening's slider: what its travel leaves open, and its limit. "60% of travel opens 30% of the frame. It opens at most 50% of its frame." */
export const openingCaption = (reading: OpeningReading) => `${reading.travel === 0 ? 'Shut.' : `${reading.travel}% of travel opens ${reading.frame}% of the frame.`} ${limitText(reading)}`;

/** The slider's value as a screen reader says it, after its name. */
export const openingSpoken = (reading: OpeningReading) => (reading.travel === 0 ? 'shut' : `${reading.travel} percent of travel, ${reading.frame} percent of the frame open`);

/** What to say, politely, once the visitor stops moving an Opening's slider. */
export const openingAnnouncement = (name: string, reading: OpeningReading) => `${name}, ${openingSpoken(reading)}. ${limitText(reading).replace('%', ' percent')}`;

/** A few words for the closed group: how many Openings the visitor has open, and whether the furniture is in. */
export const openingsHint = (open: number, total: number, furniture: boolean) => `${open} of ${total} open, furniture ${furniture ? 'on' : 'off'}`;
