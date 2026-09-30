/**
 * The Independent Contractor Agreement, as contractors sign it.
 *
 * One source of truth: the sign modal renders these sections, the printable
 * copy renders these sections, and the archived PDF renders these sections.
 * A contractor cannot be shown one thing and have another filed.
 *
 * Bump CONTRACTOR_AGREEMENT_VERSION in services/contractorAgreement.ts whenever
 * this text changes materially — that forces every contractor to re-sign, and
 * the claim gate in the database refuses the old version.
 */

export type AgreementBlock =
  | { kind: 'p'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] };

export type AgreementSection = { heading: string; blocks: AgreementBlock[] };

/** Values chosen as defaults — confirm with counsel and your insurance broker. */
export const AGREEMENT_TERMS = {
  laborSharePct: 70,
  platformFeePct: 30,
  nonSolicitMonths: 12,
  terminationNoticeDays: 7,
  insurance: {
    glPerOccurrence: '$1,000,000',
    glAggregate: '$2,000,000',
    garagekeepersPerVehicle: '$50,000',
    autoCombinedSingleLimit: '$1,000,000',
  },
  venueCounty: 'Denton County, Texas',
  informalResolutionDays: 30,
} as const;

const T = AGREEMENT_TERMS;

export const CONTRACTOR_AGREEMENT_SECTIONS: AgreementSection[] = [
  {
    heading: '1. Independent contractor relationship',
    blocks: [
      {
        kind: 'p',
        text: 'You are an independent contractor, not an employee, agent, partner or joint venturer of Adaptivity Performance LLC ("Adaptivity").',
      },
      {
        kind: 'ol',
        items: [
          'You are not entitled to employee benefits, paid leave, unemployment insurance, or workers’ compensation coverage through Adaptivity.',
          'Adaptivity withholds no income tax, Social Security, Medicare or unemployment tax from amounts paid to you.',
          'You may accept or decline any job offered through the platform, for any reason, with no penalty and no minimum acceptance rate.',
          'You may work for other companies and customers, including competitors of Adaptivity, at any time.',
          'You determine the methods, sequence and technical means by which the work is performed. Adaptivity specifies the result the customer purchased and the safety, warranty and conduct standards in Section 2 — not how you perform the repair.',
          'You set your own working hours and availability.',
          'You supply your own tools, diagnostic equipment, consumables and vehicle, at your own expense.',
          'You may hire helpers or subcontractors at your own expense and risk, subject to Section 9, and you remain responsible for their work.',
        ],
      },
    ],
  },
  {
    heading: '2. Scope of services and standards',
    blocks: [
      {
        kind: 'p',
        text: 'You perform mobile automotive diagnostic and repair services for customers who book through Adaptivity, at the customer’s location or at Adaptivity’s Justin shop. Jobs are dispatched within Adaptivity’s published service radius. You are not obligated to accept jobs at any distance.',
      },
      { kind: 'p', text: 'For each job you accept, you agree to:' },
      {
        kind: 'ul',
        items: [
          'Perform work to generally accepted professional automotive repair standards, including manufacturer torque specifications and safe lifting and support practice',
          'Use parts that meet or exceed OE specification unless the customer approves otherwise in writing',
          'Document the vehicle’s condition before and after the work, including photographs where the platform requests them',
          'Price labor and parts, and obtain the customer’s approval, before performing work beyond the diagnostic',
          'Conduct yourself professionally at the customer’s home or workplace',
          'Decline work you are not competent to perform safely',
        ],
      },
      {
        kind: 'p',
        text: 'You are not required to wear an Adaptivity uniform, display Adaptivity branding on your vehicle, attend meetings, report to a supervisor, or work a minimum number of hours or jobs.',
      },
    ],
  },
  {
    heading: '3. Compensation and payment',
    blocks: [
      {
        kind: 'p',
        text: `You keep ${T.laborSharePct}% of labor billed on each completed job, plus 100% of customer tips. Adaptivity retains ${T.platformFeePct}% of labor as its platform fee.`,
      },
      {
        kind: 'p',
        text: 'Payment is collected from the customer in person at the vehicle when the work is complete. Adaptivity settles your share with you directly; there is no online payout account to set up.',
      },
      {
        kind: 'p',
        text: 'Adaptivity settles your share on the agreed pay cycle. There is no instant cash-out and no payout processing fee charged to you.',
      },
      {
        kind: 'p',
        text: 'You may not accept cash, Zelle, Venmo, check or any other direct payment from a customer for work booked through Adaptivity, or divert a platform job off-platform. Doing so is cause for immediate termination under Section 11, and you must remit any amount so collected.',
      },
      {
        kind: 'p',
        text: 'You bear your own fuel, tools, consumables, insurance, phone and vehicle costs. Adaptivity reimburses no expense unless agreed in writing in advance.',
      },
    ],
  },
  {
    heading: '4. Warranty, comebacks and refunds',
    blocks: [
      {
        kind: 'p',
        text: 'Adaptivity bears the cost of warranty work and of customer refunds and chargebacks. Your payout on a completed job is not clawed back when a job later goes wrong.',
      },
      {
        kind: 'p',
        text: 'Adaptivity offers customers a 12-month / 12,000-mile warranty on parts and labor. That warranty runs from Adaptivity to the customer; you make no separate warranty to the customer. Adaptivity pays for warranty parts, warranty labor, refunds and payment reversals, including where the original job was yours, and will not deduct these from your earned or future payouts.',
      },
      { kind: 'p', text: 'In exchange, you agree to:' },
      {
        kind: 'ol',
        items: [
          `Perform corrective work on your own prior job when offered, paid at the normal ${T.laborSharePct}% labor rate — you are not asked to work for free, and may decline under Section 1`,
          'Cooperate in good faith with diagnosis of a comeback, including providing photographs, notes and part information from the original job',
          'Maintain the standards in Section 2',
        ],
      },
      {
        kind: 'p',
        text: 'Adaptivity absorbing this cost is not an unlimited obligation. Where your completed jobs generate warranty claims or refunds at a rate materially above Adaptivity’s average, Adaptivity may, in this order: discuss the pattern with you; restrict the job types dispatched to you; or terminate under Section 11.',
      },
      {
        kind: 'p',
        text: 'This section does not apply where the loss arises from your gross negligence, willful misconduct, work performed while impaired, work you were not competent to perform, or any act covered by Section 6. Those remain your responsibility.',
      },
    ],
  },
  {
    heading: '5. Insurance — required',
    blocks: [
      {
        kind: 'p',
        text: 'You must carry and maintain the following insurance at your own expense, and provide a certificate of insurance to Adaptivity before claiming a first job. This is a condition of performing any work.',
      },
      {
        kind: 'ul',
        items: [
          `Commercial general liability — ${T.insurance.glPerOccurrence} per occurrence / ${T.insurance.glAggregate} aggregate`,
          `Garagekeepers or equivalent care, custody and control coverage — ${T.insurance.garagekeepersPerVehicle} per vehicle`,
          `Commercial auto liability — ${T.insurance.autoCombinedSingleLimit} combined single limit`,
        ],
      },
      {
        kind: 'p',
        text: 'A standard general liability policy typically excludes damage to property in your care, custody and control — which is exactly the customer’s vehicle on your jack. Without garagekeepers or equivalent coverage, you are personally exposed on the most likely claim in this trade.',
      },
      {
        kind: 'p',
        text: 'You must name Adaptivity Performance LLC as an additional insured on the general liability and garagekeepers policies, and provide a certificate evidencing it.',
      },
      {
        kind: 'p',
        text: 'You must notify Adaptivity in writing within three business days if any required policy lapses, is cancelled, or drops below the minimum limits. Adaptivity may suspend dispatch immediately and without notice while coverage is not in force, and may request a current certificate at any time.',
      },
    ],
  },
  {
    heading: '6. Liability and indemnification',
    blocks: [
      {
        kind: 'p',
        text: 'You are personally liable for damage to a customer’s vehicle or property caused by your acts or omissions — for example dropping a vehicle off a jack, stripping a drain plug, or damaging a component during removal. This is separate from Section 4, which covers ordinary warranty comebacks.',
      },
      {
        kind: 'p',
        text: 'You will defend, indemnify and hold harmless Adaptivity Performance LLC, its members, officers and agents from any claim, demand, loss, liability, damage, cost or expense, including reasonable attorneys’ fees, arising out of:',
      },
      {
        kind: 'ol',
        items: [
          'Your performance of or failure to perform services under this Agreement',
          'Your gross negligence or willful misconduct',
          'Your breach of this Agreement, including the insurance requirements in Section 5',
          'Any claim for taxes, benefits or wages arising from your own classification of workers you engage',
          'Bodily injury to you or to anyone you engage, arising from the work',
        ],
      },
      {
        kind: 'p',
        text: 'This obligation survives termination of this Agreement.',
      },
      {
        kind: 'p',
        text: 'Adaptivity connects customers and contractors and processes payment. Adaptivity does not perform the repair work and does not supervise your methods. Adaptivity’s total liability to you under this Agreement is limited to amounts payable to you for completed jobs. Neither party is liable to the other for indirect, incidental, special or consequential damages.',
      },
    ],
  },
  {
    heading: '7. Taxes',
    blocks: [
      {
        kind: 'p',
        text: 'You are responsible for all taxes on amounts paid under this Agreement. Adaptivity withholds nothing.',
      },
      {
        kind: 'p',
        text: 'You must give Adaptivity a completed Form W-9 with a valid taxpayer identification number — SSN or EIN — before claiming a first job. Dispatch records it on receipt, and job claims are blocked until it is on file.',
      },
      {
        kind: 'p',
        text: 'Adaptivity issues you a Form 1099-NEC for each calendar year in which payments meet or exceed the IRS reporting threshold. You are responsible for reporting all income regardless of whether a 1099 is issued, and for federal income tax, self-employment tax (Social Security and Medicare), and any state or local tax. We recommend setting aside a portion of each payout and consulting a tax professional about quarterly estimated payments.',
      },
      {
        kind: 'p',
        text: 'You are responsible for the accuracy of the tax information you provide, and must notify Adaptivity of any change to your legal name, entity type or taxpayer identification number.',
      },
    ],
  },
  {
    heading: '8. Workers’ compensation and injury',
    blocks: [
      {
        kind: 'p',
        text: 'You are responsible for your own injury and medical coverage. Adaptivity does not provide workers’ compensation coverage to you.',
      },
      {
        kind: 'p',
        text: 'Texas does not require most private employers to carry workers’ compensation insurance. Adaptivity is a non-subscriber and does not extend coverage to independent contractors.',
      },
      {
        kind: 'ul',
        items: [
          'Adaptivity is not liable for your on-the-job injuries or resulting medical costs',
          'You are responsible for obtaining your own health, disability or occupational accident coverage',
          'You are not eligible for unemployment benefits through Adaptivity',
        ],
      },
    ],
  },
  {
    heading: '9. Licensing, driving and background',
    blocks: [
      { kind: 'p', text: 'You represent and warrant, for the term of this Agreement, that you:' },
      {
        kind: 'ol',
        items: [
          'Hold a valid driver’s license and maintain the auto liability coverage required by Section 5',
          'Have the training, skill and experience to perform the accepted work safely and competently',
          'Hold any license, certification or registration required by Texas law or local ordinance for the work performed',
          'Will not perform work while impaired by alcohol, drugs or any substance affecting judgment or coordination',
          'Will notify Adaptivity within three business days of any conviction, license suspension, or insurance cancellation that could affect your ability to perform',
        ],
      },
      {
        kind: 'p',
        text: 'You consent to a background check and motor vehicle record check before dispatch and periodically thereafter. Customers admit you to their homes and workplaces, which is why this is required.',
      },
      {
        kind: 'p',
        text: 'If you engage anyone to assist, you are solely responsible for that person — their pay, taxes, insurance, background and conduct — and your indemnity under Section 6 extends to their acts. Adaptivity may require that any such person also pass a background check before entering a customer’s property.',
      },
    ],
  },
  {
    heading: '10. Confidentiality and customer non-solicitation',
    blocks: [
      {
        kind: 'p',
        text: 'Customer names, addresses, phone numbers, vehicle records, service history, pricing, and Adaptivity’s business and technical information are confidential. You will use them only to perform services under this Agreement, will not disclose them, and will not retain, copy or export them after termination.',
      },
      {
        kind: 'p',
        text: `For ${T.nonSolicitMonths} months after your last job, you will not solicit any customer you first serviced through Adaptivity for mobile automotive repair services outside the platform.`,
      },
      {
        kind: 'ul',
        items: [
          'This applies only to customers you met through Adaptivity, not to your own pre-existing customers',
          'It does not prevent you from working for other companies or serving the general public — Section 1 expressly permits that',
          'It does not prevent a customer from independently choosing to contact you without solicitation',
        ],
      },
      {
        kind: 'p',
        text: 'On termination, you will delete or return customer data in your possession, including data stored on personal devices.',
      },
    ],
  },
  {
    heading: '11. Term and termination',
    blocks: [
      {
        kind: 'p',
        text: `This Agreement begins when you sign it and continues until terminated. Either party may terminate on ${T.terminationNoticeDays} days’ written notice, for any reason or no reason.`,
      },
      {
        kind: 'p',
        text: 'Adaptivity may terminate immediately, and suspend dispatch without notice, for:',
      },
      {
        kind: 'ul',
        items: [
          'Collecting payment directly from a platform customer, in breach of Section 3',
          'Lapse of required insurance under Section 5',
          'Working while impaired, or any conduct endangering a customer, their property or the public',
          'Theft, dishonesty, or falsifying job records',
          'A pattern of comebacks under Section 4, after the steps described there',
          'Breach of Section 10',
          'Loss of a license or a background result affecting fitness to perform',
        ],
      },
      {
        kind: 'p',
        text: 'You will complete or safely hand off any job already accepted, leaving the customer’s vehicle in a safe condition. Adaptivity will pay your share for work completed through the termination date on the normal schedule and, consistent with Section 4, will not withhold final payout against anticipated warranty claims. Adaptivity may immediately disable your platform and portal access.',
      },
      {
        kind: 'p',
        text: 'Sections 6, 10, 12 and 13 survive termination.',
      },
    ],
  },
  {
    heading: '12. Dispute resolution and governing law',
    blocks: [
      {
        kind: 'p',
        text: 'This Agreement is governed by the laws of the State of Texas, without regard to its conflict of laws rules.',
      },
      {
        kind: 'p',
        text: `Before filing anything, the parties will attempt in good faith to resolve the dispute through direct discussion for at least ${T.informalResolutionDays} days after written notice of the dispute.`,
      },
      {
        kind: 'p',
        text: `Any dispute not resolved that way will be brought in the state or federal courts located in ${T.venueCounty}, and both parties consent to that venue.`,
      },
    ],
  },
  {
    heading: '13. General provisions',
    blocks: [
      {
        kind: 'p',
        text: 'This Agreement is the complete agreement between the parties on its subject and supersedes all prior agreements and understandings, written or oral, including any earlier version of this Agreement.',
      },
      {
        kind: 'p',
        text: 'Adaptivity may issue a revised version of this Agreement. A revised version takes effect for you only when you sign it, and Adaptivity may suspend dispatch until the current version is signed. Your signature on an earlier version does not carry forward.',
      },
      {
        kind: 'p',
        text: 'If any provision is held unenforceable, it is modified to the minimum extent necessary to make it enforceable, or severed, and the remainder stays in force. A failure to enforce any provision is not a waiver of it. You may not assign this Agreement without Adaptivity’s written consent; Adaptivity may assign it to a successor or affiliate. Notices go to the email addresses on file and are effective on the next business day.',
      },
      {
        kind: 'p',
        text: 'The parties agree this Agreement may be signed electronically, and that an electronic signature is the legal equivalent of a handwritten signature under the federal E-SIGN Act (15 U.S.C. § 7001) and the Texas Uniform Electronic Transactions Act. Adaptivity retains the signed record and will provide you a copy on request.',
      },
    ],
  },
];
