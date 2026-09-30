/**
 * Who the business legally is.
 *
 * The registered entity is RealAdaptivity LLC; AdaptivityPerformance is the
 * name it trades under. The site had been printing "Adaptivity Performance
 * LLC" in its copyright line and elsewhere, which names a company that does
 * not exist — and it sat on the same page as a privacy policy naming the real
 * entity, so the two disagreed.
 *
 * Everything that has to name the entity reads this constant, so a rename is
 * one edit rather than a hunt.
 */

/** Registered entity, with the trading name. Use where the legal person matters:
 *  copyright, policies, the SMS campaign registration. */
export const LEGAL_ENTITY_NAME = 'RealAdaptivity LLC DBA AdaptivityPerformance';

/** Registered entity on its own, where the DBA would be noise. */
export const LEGAL_ENTITY_SHORT = 'RealAdaptivity LLC';

/** The trading name customers know, for ordinary marketing copy. This is not a
 *  legal-entity claim, so it carries no LLC. */
export const TRADING_NAME = 'Adaptivity Performance';

/** Registered business address. */
export const LEGAL_ENTITY_ADDRESS = '410 FM 156, Justin, TX 76247';
