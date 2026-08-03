export type TemplateType = "officialForm" | "publicForm" | "genericWorksheet" | "infoOnly" | "flatForm";
export type TemplateSourceKind = "governmentPublic" | "publicForm" | "genericWorksheet" | "sample" | "underReview";

export interface TemplateDirectoryItem {
  file: string;
  slug?: string;
  formCode?: string;
  title: string;
  description: string;
  category: string;
  agency: string;
  pageCount: number;
  estimatedTime: string;
  commonUse: string;
  templateType: TemplateType;
  sourceKind: TemplateSourceKind;
  badge?: string;
  popular?: boolean;
  hideFromMainGrid?: boolean;
  qualityNote?: string;
  allowFill?: boolean;
  indexable?: boolean;
  tags: string[];
}

interface TemplateSeoContent {
  seoTitle: string;
  seoDescription: string;
  whatIsThis: string;
  keywords: string[];
  whoNeedsThis: string;
  howToComplete: string[];
  commonMistakes: string[];
  faqs: { q: string; a: string }[];
}

interface TemplateLandingPage extends TemplateSeoContent {
  slug: string;
}

interface TemplateWithoutLandingPage {
  slug?: never;
  seoTitle?: never;
  seoDescription?: never;
  whatIsThis?: never;
  keywords?: never;
  whoNeedsThis?: never;
  howToComplete?: never;
  commonMistakes?: never;
  faqs?: never;
}

export type TemplatePageConfig = Omit<TemplateDirectoryItem, "slug"> & TemplateLandingPage;
export type TemplateConfig = Omit<TemplateDirectoryItem, "slug"> &
  (TemplateLandingPage | TemplateWithoutLandingPage);

export const templates: TemplateConfig[] = [
  {
    slug: "tfn-declaration",
    file: "ato-tfn-declaration.pdf",
    formCode: "NAT 3092",
    title: "Tax File Number Declaration",
    description: "Public ATO form (NAT 3092) for declaring your TFN to your employer.",
    category: "ATO",
    agency: "Australian Taxation Office",
    pageCount: 7,
    estimatedTime: "5-8 min",
    commonUse: "starting a new job or changing payroll details",
    templateType: "infoOnly",
    sourceKind: "underReview",
    badge: "Info only",
    hideFromMainGrid: true,
    qualityNote:
      "This TFN Declaration entry is under review because the bundled PDF appears to be an information document rather than a fillable TFN declaration form.",
    allowFill: false,
    indexable: false,
    tags: ["tax", "employment", "new job", "payroll", "NAT 3092", "TFN"],
    seoTitle: "Tax File Number Declaration (NAT 3092) | QuickFill",
    seoDescription: "Review the Tax File Number Declaration (NAT 3092) template and its completion guidance before giving the current form to your employer.",
    whatIsThis: "The Tax File Number (TFN) Declaration is an ATO form that you must complete when starting a new job. It tells your employer how much tax to withhold from your pay based on your tax circumstances.",
    keywords: ["tfn declaration", "tfn form", "ato tfn", "NAT 3092", "tax file number declaration"],
    whoNeedsThis: "You need to complete a TFN Declaration whenever you start a new job in Australia. Your employer requires this form to set up your payroll and withhold the correct amount of tax from your wages. Students, part-time workers, and full-time employees all need to submit this form to their employer.",
    howToComplete: [
      "Enter your full legal name exactly as it appears on your official documents",
      "Provide your TFN if you have one - you can find it on your income tax notice of assessment or myGov account",
      "Select your residency status for tax purposes (Australian resident or foreign resident)",
      "Indicate if you are claiming the tax-free threshold from this employer (tick this box if it is your only job)",
      "Sign and date the form - unsigned forms are not valid and your employer cannot process them"
    ],
    commonMistakes: [
      "Leaving the TFN field blank when you actually have one - while you can still work without providing it, your employer will withhold tax at the highest marginal rate plus the Medicare levy",
      "Forgetting to sign the form - an unsigned TFN declaration is invalid and will delay your payroll setup",
      "Claiming the tax-free threshold on multiple jobs simultaneously - this can result in a tax debt when you lodge your annual return"
    ],
    faqs: [
      {
        q: "Do I need a TFN declaration for a second job?",
        a: "Yes, you need to complete a TFN declaration for each job you start. However, you should only claim the tax-free threshold from one employer (usually your main job). If you claim it from multiple jobs, you will likely owe tax at the end of the financial year."
      },
      {
        q: "What happens if I don't provide my TFN?",
        a: "You can still work without providing your TFN, but your employer must withhold tax at the highest marginal rate (currently 47% including the Medicare levy). Providing your TFN ensures you are taxed at the correct rate based on your income bracket."
      },
      {
        q: "When should I submit my TFN declaration?",
        a: "Submit your TFN declaration to your employer as soon as possible after starting your job. While you can start work without it, providing it within 28 days ensures you are not taxed at the highest rate from your first pay."
      }
    ]
  },
  {
    slug: "super-choice",
    file: "ato-super-choice.pdf",
    formCode: "NAT 13080",
    title: "Superannuation Standard Choice",
    description: "Public ATO form (NAT 13080) to choose which super fund receives your contributions.",
    category: "ATO",
    agency: "Australian Taxation Office",
    pageCount: 5,
    estimatedTime: "4-7 min",
    commonUse: "choosing or updating your super fund with an employer",
    templateType: "officialForm",
    sourceKind: "governmentPublic",
    badge: "Official form",
    popular: true,
    tags: ["super", "employment", "new job", "ATO", "NAT 13080"],
    seoTitle: "Fill Superannuation Standard Choice (NAT 13080) Online | QuickFill",
    seoDescription: "Fill and preview the Superannuation Standard Choice form (NAT 13080) online, then unlock the finished PDF to give your employer.",
    whatIsThis: "The Superannuation Standard Choice form allows you to nominate which superannuation fund you want your employer to pay your super contributions into. This is your right under Australian law.",
    keywords: ["super choice form", "superannuation choice", "NAT 13080", "choose super fund", "super nomination"],
    whoNeedsThis: "All Australian employees aged 18 or older who want to choose their own superannuation fund need to complete this form. If you do not choose a fund, your employer will pay your super into their default nominated fund, which may have higher fees or not suit your needs. This form is essential for anyone starting a new job or wanting to consolidate their super.",
    howToComplete: [
      "Enter your personal details including full name, date of birth, and TFN (essential for your fund to identify you)",
      "Provide the details of your chosen super fund including the fund name, ABN, and USI (Unique Super Identifier)",
      "Include your membership number with the chosen fund if you already have an account",
      "Sign and date the form to confirm your choice",
      "Keep a copy for your records and provide the original to your employer"
    ],
    commonMistakes: [
      "Not providing your TFN - this can delay your super contributions and may result in lost or unclaimed super",
      "Choosing a fund without checking fees and performance - compare your options using the ATO's super comparison tool",
      "Forgetting to update your choice when changing jobs - your previous choice does not automatically transfer to new employers"
    ],
    faqs: [
      {
        q: "Can I change my super fund after submitting this form?",
        a: "Yes, you can change your super fund at any time by completing a new Super Choice form and providing it to your employer. Your new choice will apply to future super contributions from that employer."
      },
      {
        q: "What happens if I don't choose a super fund?",
        a: "If you do not choose a fund, your employer is required to pay your super into their nominated default fund. This fund may charge higher fees or not offer the investment options you prefer, so it is worth choosing your own fund."
      },
      {
        q: "Do I need a super fund before starting a new job?",
        a: "While you can start work without a super fund, it is best to have one set up before your first payday. If you do not have a fund, your employer will choose one for you, but you can change it later by completing this form."
      }
    ]
  },
  {
    slug: "withholding-declaration",
    file: "ato-withholding-declaration.pdf",
    formCode: "NAT 3093",
    title: "Withholding Declaration",
    description: "Public ATO form (NAT 3093) for withholding changes, study loan debts and tax offsets.",
    category: "ATO",
    agency: "Australian Taxation Office",
    pageCount: 7,
    estimatedTime: "5-8 min",
    commonUse: "updating tax withholding after your circumstances change",
    templateType: "officialForm",
    sourceKind: "governmentPublic",
    badge: "Official form",
    tags: ["tax", "withholding", "HELP debt", "Medicare levy", "NAT 3093"],
    seoTitle: "Fill Withholding Declaration (NAT 3093) Online | QuickFill",
    seoDescription: "Fill and preview the ATO Withholding Declaration (NAT 3093) online, then unlock the finished PDF to give your employer or other payer.",
    whatIsThis: "The Withholding Declaration (NAT 3093) authorises your employer or other payer to adjust the PAYG tax withheld from your payments after you have provided a Tax File Number Declaration. Use it to update your tax residency, tax-free threshold, study and training loan obligations, or eligible tax offsets. Medicare levy changes use the separate Medicare Levy Variation Declaration identified by the ATO.",
    keywords: [
      "withholding declaration",
      "NAT 3093",
      "PAYG withholding form",
      "HELP debt withholding",
      "study loan withholding",
      "Medicare levy variation",
      "tax offset declaration"
    ],
    whoNeedsThis: "Employees and other payees use this form when information previously given to their current payer has changed, including tax residency, whether they claim the tax-free threshold, HELP or other study and training loan obligations, and eligible tax offsets. A new payer may also need updated declarations before working out how much tax to withhold.",
    howToComplete: [
      "Make sure you have already given this payer a Tax File Number Declaration (NAT 3092) quoting your TFN or claiming an exemption",
      "Enter your personal details and select your current tax residency and tax-free threshold choices",
      "State whether you have a HELP, VSL, FS, SSL or AASL debt and update the answer if the loan has been repaid in full",
      "Complete the tax offset questions only for entitlements you can claim with this payer; use the separate Medicare Levy Variation Declaration for Medicare levy adjustments",
      "Sign and date the payee declaration, give it to your payer, and let the payer complete and retain Section B"
    ],
    commonMistakes: [
      "Using NAT 3093 for a Medicare levy adjustment - the ATO uses a separate Medicare Levy Variation Declaration for that change",
      "Claiming the tax-free threshold or the same tax offset from more than one payer when the form instructions do not allow it",
      "Sending the completed declaration to the ATO - your payer completes Section B and keeps the sensitive form"
    ],
    faqs: [
      {
        q: "When should I complete a Withholding Declaration?",
        a: "Complete a new declaration when information you gave your current payer changes, such as your residency, tax-free threshold, study or training loan obligations, or tax offset entitlement. Follow the ATO instructions if you start receiving payments from a new payer."
      },
      {
        q: "Can I use NAT 3093 to change my Medicare levy withholding?",
        a: "No. The ATO identifies the Medicare Levy Variation Declaration (NAT 0929) as the separate form for eligible Medicare levy withholding adjustments."
      },
      {
        q: "Do I send the completed form to the ATO?",
        a: "No. Give the signed declaration to your employer or other payer. The payer completes Section B, treats the information as sensitive, and keeps the form rather than sending it to the ATO."
      }
    ]
  },
  {
    slug: "employment-separation",
    file: "employment-separation.pdf",
    formCode: "SU001",
    title: "Employment Separation Certificate",
    description: "Public Services Australia form for when employment ends and income support may be needed.",
    category: "Centrelink",
    agency: "Services Australia",
    pageCount: 4,
    estimatedTime: "6-10 min",
    commonUse: "confirming employment details after leaving a job",
    templateType: "officialForm",
    sourceKind: "governmentPublic",
    badge: "Official form",
    popular: true,
    tags: ["Centrelink", "employment", "separation", "income support", "SU001"],
    seoTitle: "Fill Employment Separation Certificate (SU001) Online | QuickFill",
    seoDescription: "Fill and preview the Employment Separation Certificate (SU001) online for a Centrelink claim, then unlock the finished PDF.",
    whatIsThis: "An Employment Separation Certificate is required by Centrelink when you leave a job and want to claim income support. Your employer must complete this form to verify your employment details and reason for leaving.",
    keywords: ["employment separation certificate", "centrelink separation", "SU001", "separation form", "leave job centrelink"],
    whoNeedsThis: "You need an Employment Separation Certificate when you have left a job and are planning to claim income support payments from Centrelink. This includes JobSeeker Payment, Youth Allowance, and Austudy. The certificate must be completed by your employer and provides Centrelink with the information needed to assess your eligibility and any waiting periods.",
    howToComplete: [
      "Request the certificate from your employer as soon as possible after leaving your job",
      "Ensure your employer completes all sections including your employment dates, reason for leaving, and final payment details",
      "Check that your personal details are correct including your name and address",
      "Submit the completed certificate to Services Australia through your myGov account or by phone",
      "Keep a copy for your records in case Services Australia needs to verify the information"
    ],
    commonMistakes: [
      "Delaying the request for a certificate - employers are legally required to provide it within 14 days, but delays can postpone your Centrelink payment",
      "Not checking the reason for leaving - an incorrect reason can affect your waiting period for payments",
      "Submitting an incomplete form - missing information will delay processing and may require your employer to complete it again"
    ],
    faqs: [
      {
        q: "What if my employer refuses to provide a separation certificate?",
        a: "Employers are legally required to provide a separation certificate within 14 days of your request. If they refuse, contact Services Australia who can assist. You may also need to provide evidence of your employment and separation circumstances."
      },
      {
        q: "Can I claim Centrelink before getting my separation certificate?",
        a: "Yes, you can lodge your claim for income support without the certificate, but your payment may be delayed until Services Australia receives it. It is best to submit your claim as soon as possible and provide the certificate when you receive it."
      },
      {
        q: "How long does a separation certificate remain valid?",
        a: "A separation certificate is valid for the specific period of employment it covers. If you have multiple jobs or periods of employment, you may need separate certificates for each. The certificate does not expire but is only relevant to the employment period it documents."
      }
    ]
  },
  {
    slug: "medicare-enrolment",
    file: "medicare-enrolment.pdf",
    formCode: "MS004",
    title: "Medicare Enrolment Form",
    description: "Public Services Australia form (MS004) for Medicare card applications and enrolment changes.",
    category: "Healthcare",
    agency: "Services Australia",
    pageCount: 17,
    estimatedTime: "10-15 min",
    commonUse: "applying for or updating Medicare enrolment",
    templateType: "officialForm",
    sourceKind: "governmentPublic",
    badge: "Official form",
    tags: ["Medicare", "health", "Services Australia", "MS004", "enrolment"],
    seoTitle: "Fill Medicare Enrolment Form (MS004) Online | QuickFill",
    seoDescription: "Fill and preview the Medicare Enrolment Form (MS004) online for a new or updated enrolment, then unlock the finished PDF.",
    whatIsThis: "The Medicare Enrolment form is used to apply for a Medicare card if you're a new Australian resident or citizen. Medicare provides access to subsidised healthcare services across Australia.",
    keywords: ["medicare enrolment", "medicare card application", "MS004", "medicare form", "apply medicare"],
    whoNeedsThis: "You need to complete a Medicare enrolment form if you are a new Australian citizen, permanent resident, or eligible temporary resident who wants access to Australia's public healthcare system. This includes people who have recently arrived in Australia, newborn babies, and those who have never been enrolled before. Enrolment gives you access to subsidised medical services and public hospital treatment.",
    howToComplete: [
      "Gather required documents including proof of identity, citizenship or residency status, and proof of address",
      "Complete all sections of the form with your personal details including full name, date of birth, and address",
      "Provide details of any existing Medicare number if you have had one previously",
      "Sign the declaration confirming your eligibility for Medicare",
      "Submit the form in person at a Services Australia centre with your original documents for verification"
    ],
    commonMistakes: [
      "Not bringing original documents - photocopies are not accepted for initial enrolment, you must present originals",
      "Incomplete address information - your Medicare card will be mailed to the address provided, so ensure it is current and accurate",
      "Missing eligibility requirements - not all visa holders are eligible for Medicare, check your visa conditions before applying"
    ],
    faqs: [
      {
        q: "How long does it take to get a Medicare card after applying?",
        a: "Once your application is approved, your Medicare card is typically mailed within 3 weeks. You can request a digital Medicare card through the Express Plus Medicare app while waiting for your physical card."
      },
      {
        q: "Can I enrol for Medicare online?",
        a: "Initial Medicare enrolment requires an in-person visit to a Services Australia centre where your original documents will be verified. Once enrolled, you can manage your Medicare details online through myGov."
      },
      {
        q: "Who is eligible for Medicare in Australia?",
        a: "Eligible people include Australian citizens, permanent residents, New Zealand citizens living in Australia, and holders of certain temporary visas with reciprocal healthcare agreements. Check Services Australia for the full list of eligible visa types."
      }
    ]
  },
  {
    slug: "statutory-declaration",
    file: "statutory-declaration.pdf",
    title: "Statutory Declaration Form",
    description: "General Australian statutory declaration form with witness section and declaration wording.",
    category: "Legal",
    agency: "Australian public form",
    pageCount: 2,
    estimatedTime: "3-5 min",
    commonUse: "making a formal written declaration",
    templateType: "publicForm",
    sourceKind: "publicForm",
    badge: "Public form",
    popular: true,
    tags: ["legal", "declaration", "witness", "stat dec", "statutory declaration"],
    seoTitle: "Fill Statutory Declaration Form Online | QuickFill",
    seoDescription: "Fill and preview an Australian statutory declaration with declaration wording and a witness section, then unlock the finished PDF.",
    whatIsThis: "A statutory declaration is a written statement of fact that you declare to be true. It must be signed in the presence of an authorised witness such as a justice of the peace, lawyer, or police officer.",
    keywords: ["statutory declaration", "stat dec", "legal declaration", "witness declaration", "australian statutory declaration"],
    whoNeedsThis: "You need a statutory declaration when you must formally declare facts for legal or official purposes in Australia. Common uses include confirming identity documents, declaring marital status, confirming residency, or providing evidence for visa applications. Government agencies, courts, and organisations often require statutory declarations as formal proof of statements.",
    howToComplete: [
      "Write your declaration in the first person using clear and specific language",
      "Number each paragraph and state only facts you know to be true, not opinions",
      "Include your full name, address, and occupation at the beginning",
      "Do not sign the document until you are in the presence of an authorised witness",
      "Have your declaration witnessed by an eligible person such as a justice of the peace, solicitor, or pharmacist"
    ],
    commonMistakes: [
      "Including hearsay or opinions - statutory declarations must contain only facts within your personal knowledge",
      "Signing before a witness - the document is invalid if signed before the witness is present",
      "Using an unauthorised witness - only certain professions can witness statutory declarations under the Oaths Act"
    ],
    faqs: [
      {
        q: "Who can witness a statutory declaration in Australia?",
        a: "Authorised witnesses include justices of the peace, solicitors, barristers, magistrates, police officers, pharmacists, and medical practitioners. The witness must be an adult and cannot be a party to the declaration or related to you."
      },
      {
        q: "Is a statutory declaration legally binding?",
        a: "Yes, making a false statement in a statutory declaration is a criminal offence punishable by imprisonment. You must ensure all information is true and accurate to the best of your knowledge."
      },
      {
        q: "Can I use a statutory declaration for any purpose?",
        a: "Statutory declarations are accepted for many official purposes, but some organisations may require specific forms or alternative documentation. Always check with the requesting organisation whether a statutory declaration is acceptable for your needs."
      }
    ]
  },
  {
    slug: "centrelink-su415",
    file: "centrelink-su415.pdf",
    formCode: "SU415",
    title: "Centrelink Income and Assets Form",
    description: "Services Australia form for declaring income, assets, partner details and financial changes.",
    category: "Centrelink",
    agency: "Services Australia",
    pageCount: 2,
    estimatedTime: "8-12 min",
    commonUse: "declaring income and assets to Centrelink",
    templateType: "infoOnly",
    sourceKind: "underReview",
    badge: "Under review",
    hideFromMainGrid: true,
    qualityNote:
      "This Centrelink SU415 entry is under review because the bundled PDF appears incorrect or mislabelled and should not be treated as a valid official form.",
    allowFill: false,
    indexable: false,
    tags: ["Centrelink", "income", "assets", "Services Australia", "SU415"],
    seoTitle: "Centrelink Income and Assets Form (SU415) | QuickFill",
    seoDescription: "Review the Centrelink Income and Assets Form (SU415) and its guidance before using the current Services Australia form.",
    whatIsThis: "The SU415 form is used by Centrelink to assess your income and assets for payment eligibility. You'll need to provide details about your employment, other income, bank accounts, investments, and property.",
    keywords: ["SU415", "centrelink income assets", "income declaration", "assets form", "centrelink assessment"],
    whoNeedsThis: "You need to complete the SU415 income and assets form when Centrelink requests it for payment assessment, review, or renewal. This includes people claiming JobSeeker, Youth Allowance, Age Pension, Disability Support Pension, and other income support payments. The form helps Services Australia determine your payment rate and eligibility based on your financial circumstances.",
    howToComplete: [
      "Gather all financial documents including bank statements, investment accounts, and payslips",
      "Declare all sources of income including employment, investments, rental income, and foreign income",
      "List all assets including property, vehicles, bank balances, and investments above the reporting threshold",
      "Provide details of any changes to your circumstances since your last declaration",
      "Sign and date the form and submit it by the requested deadline to avoid payment delays"
    ],
    commonMistakes: [
      "Underdeclaring income or assets - this can result in overpayments that you will need to repay plus potential penalties",
      "Not reporting changes promptly - you must inform Centrelink of significant changes within 14 days",
      "Forgetting to include partner's income - if you are partnered, both your and your partner's income and assets are assessed"
    ],
    faqs: [
      {
        q: "What happens if I provide false information on the SU415?",
        a: "Providing false or misleading information to Centrelink is a serious offence that can result in payment cancellation, debt recovery, and potential criminal charges. Always declare your true financial circumstances."
      },
      {
        q: "How often do I need to update my income and assets declaration?",
        a: "Centrelink may request updates at any time, but you must report changes in your circumstances within 14 days. Regular reviews typically occur annually for pension recipients and more frequently for working-age payments."
      },
      {
        q: "What assets are exempt from the Centrelink assets test?",
        a: "Your principal home and certain personal items are generally exempt. Some assets may be subject to the income test even if exempt from the assets test. Check Services Australia for the current exemption thresholds and rules."
      }
    ]
  },
  {
    slug: "rental-application-nsw",
    file: "tenancy-application-nsw.pdf",
    title: "NSW Rental Application Worksheet",
    description: "Generic New South Wales rental application worksheet with applicant, employment and rental history fields.",
    category: "Real Estate",
    agency: "Generic Australian worksheet",
    pageCount: 3,
    estimatedTime: "7-10 min",
    commonUse: "applying for a rental property in New South Wales",
    templateType: "genericWorksheet",
    sourceKind: "genericWorksheet",
    badge: "Generic worksheet",
    tags: ["rental", "tenancy", "NSW", "worksheet", "real estate"],
    seoTitle: "Fill NSW Rental Application Worksheet Online | QuickFill",
    seoDescription: "Complete a generic NSW rental application worksheet online. Check the agent or landlord's current instructions before submitting.",
    whatIsThis: "This is a generic rental application worksheet for New South Wales. It collects information about your identity, employment, rental history, and references to help prepare a tenancy application.",
    keywords: ["rental application nsw", "tenancy application nsw", "rental form nsw", "nsw lease application", "rent application"],
    whoNeedsThis: "You may use this worksheet when preparing to apply for a residential rental property in New South Wales. Landlords and property managers may require their own current application process, so check the receiving organisation's instructions before submitting.",
    howToComplete: [
      "Provide accurate personal details including full name, date of birth, and current address",
      "Include employment details with your employer's contact information for verification",
      "List your rental history for the past two years with previous landlord contact details",
      "Disclose any pets or occupants who will live in the property",
      "Attach supporting documents such as proof of income, identification, and reference letters"
    ],
    commonMistakes: [
      "Providing incomplete rental history - gaps or missing references can weaken your application",
      "Not disclosing all occupants - all adults living in the property must be listed on the application",
      "Submitting inconsistent information - ensure your application matches your supporting documents"
    ],
    faqs: [
      {
        q: "Can I be charged for submitting a rental application in NSW?",
        a: "No, landlords and agents cannot charge fees for processing rental applications in NSW. Any costs associated with the application should be borne by the landlord or agent."
      },
      {
        q: "How long does a rental application take to process?",
        a: "Processing times vary but typically take 24 to 48 hours. The agent will contact previous landlords and employers for references before making a decision."
      },
      {
        q: "What documents do I need for a rental application?",
        a: "Commonly required documents include photo identification, proof of income (payslips or tax returns), bank statements, and reference letters from previous landlords or employers."
      }
    ]
  },
  {
    slug: "rental-application-vic",
    file: "tenancy-application-vic.pdf",
    title: "VIC Rental Application Worksheet",
    description: "Victoria rental application worksheet under review for currency and prescribed-form accuracy.",
    category: "Real Estate",
    agency: "Generic Australian worksheet",
    pageCount: 3,
    estimatedTime: "7-10 min",
    commonUse: "applying for a rental property in Victoria",
    templateType: "genericWorksheet",
    sourceKind: "underReview",
    badge: "Under review",
    hideFromMainGrid: true,
    qualityNote:
      "This Victorian rental application is under review because it may be outdated or may not match the current prescribed rental application requirements.",
    allowFill: false,
    indexable: false,
    tags: ["rental", "tenancy", "VIC", "worksheet", "real estate"],
    seoTitle: "VIC Rental Application Worksheet | QuickFill",
    seoDescription: "Victoria rental application worksheet under review. Check Consumer Affairs Victoria and the receiving agent's current instructions before using.",
    whatIsThis: "This is a Victorian rental application worksheet that is currently under review. It should not be treated as the current prescribed rental application form unless you have checked the receiving organisation's instructions.",
    keywords: ["rental application vic", "tenancy application vic", "rental form victoria", "vic lease application", "rent application victoria"],
    whoNeedsThis: "This page is retained only as an under-review reference. Victorian renters should check the current prescribed application requirements and the agent or landlord's instructions before submitting any rental application.",
    howToComplete: [
      "Enter your full legal name and current contact details including phone and email",
      "Provide detailed employment information including your employer's name, address, and supervisor contact",
      "List your rental history for the past two years with reasons for leaving each property",
      "Disclose any pets, vehicles, or additional occupants who will reside at the property",
      "Attach supporting documentation including identification, income verification, and references"
    ],
    commonMistakes: [
      "Omitting previous addresses - incomplete rental history can raise concerns about your reliability as a tenant",
      "Not providing accurate contact details - agents need to be able to verify your information quickly",
      "Failing to declare pets - undisclosed pets can lead to lease termination if discovered later"
    ],
    faqs: [
      {
        q: "Can a landlord reject my application without giving a reason in Victoria?",
        a: "Under Victorian law, landlords must have a valid reason for rejecting an application. Common valid reasons include incomplete applications, poor rental history, or insufficient income. You can request feedback if your application is unsuccessful."
      },
      {
        q: "How many people can apply for the same rental property?",
        a: "Multiple parties can apply for the same property. The landlord or agent will assess all applications against their selection criteria and choose the most suitable tenant."
      },
      {
        q: "What happens after my rental application is approved?",
        a: "Once approved, you will be asked to sign a residential tenancy agreement and pay the bond and rent in advance. The agent will register your bond with the Residential Tenancies Bond Authority."
      }
    ]
  },
  {
    file: "rental-application.pdf",
    title: "Rental Application Worksheet",
    description: "Generic residential rental application worksheet for Australian properties and applicant screening.",
    category: "Real Estate",
    agency: "Generic Australian worksheet",
    pageCount: 2,
    estimatedTime: "6-9 min",
    commonUse: "applying for a rental property with basic details",
    templateType: "genericWorksheet",
    sourceKind: "genericWorksheet",
    badge: "Generic worksheet",
    popular: true,
    tags: ["rental", "tenancy", "lease", "property", "worksheet", "real estate"]
  },
  {
    slug: "super-hardship",
    file: "superannuation-hardship.pdf",
    title: "Superannuation Early Release - Financial Hardship",
    description: "Form for early release of superannuation on financial hardship or compassionate grounds.",
    category: "Superannuation",
    agency: "Australian template",
    pageCount: 2,
    estimatedTime: "8-12 min",
    commonUse: "applying for early access to super in hardship circumstances",
    templateType: "genericWorksheet",
    sourceKind: "genericWorksheet",
    badge: "Generic worksheet",
    tags: ["super", "hardship", "financial hardship", "early release", "fund"],
    seoTitle: "Fill Superannuation Financial Hardship Form Online | QuickFill",
    seoDescription: "Fill and preview a superannuation financial hardship worksheet online, then unlock the finished PDF for your application.",
    whatIsThis: "This form allows you to apply for early release of your superannuation on the grounds of financial hardship. You must meet specific criteria set by the Australian Prudential Regulation Authority (APRA) and provide evidence of your financial situation.",
    keywords: ["super hardship", "early release super", "financial hardship super", "superannuation release", "compassionate grounds"],
    whoNeedsThis: "You may apply for early release of super on financial hardship grounds if you have been receiving eligible government income support payments for 26 weeks continuously and cannot meet reasonable and immediate family living expenses. This assistance is designed for Australians experiencing genuine financial hardship who have exhausted other options for financial support.",
    howToComplete: [
      "Confirm you have received eligible Centrelink payments for at least 26 weeks continuously",
      "Provide evidence of your income support payments from Services Australia",
      "Document your financial situation including income, expenses, and debts",
      "Specify the amount you need and how it will be used to address your hardship",
      "Submit the application to your super fund along with all required supporting documents"
    ],
    commonMistakes: [
      "Not meeting the 26-week requirement - you must have received continuous income support for the full period",
      "Requesting more than the permitted amount - hardship releases are capped at specific limits",
      "Incomplete documentation - missing evidence will delay or result in rejection of your application"
    ],
    faqs: [
      {
        q: "How much super can I release under financial hardship?",
        a: "If you are under your preservation age, you can release between $1,000 and $10,000 once in a 12-month period. The amount is tax-free up to the low rate threshold and taxable above that."
      },
      {
        q: "What counts as reasonable living expenses?",
        a: "Reasonable living expenses include mortgage or rent, utilities, food, medical costs, and minimum debt repayments. Luxury items and discretionary spending are not considered reasonable living expenses."
      },
      {
        q: "Can I apply for early release for medical expenses?",
        a: "Medical expenses may qualify under compassionate grounds rather than financial hardship. Compassionate release has different criteria and requires approval from the Department of Human Services."
      }
    ]
  },
  {
    slug: "tax-invoice",
    file: "australian-invoice.pdf",
    title: "Australian Tax Invoice Template",
    description: "Australian tax invoice template with ABN, GST breakdown, line items and payment details.",
    category: "Business",
    agency: "Australian business template",
    pageCount: 2,
    estimatedTime: "3-6 min",
    commonUse: "sending a professional invoice to a customer",
    templateType: "genericWorksheet",
    sourceKind: "sample",
    badge: "Under review",
    hideFromMainGrid: true,
    qualityNote:
      "This tax invoice template is hidden while it is under review because the bundled PDF contains sample data and should be replaced before normal use.",
    allowFill: false,
    indexable: false,
    tags: ["invoice", "tax invoice", "business", "ABN", "GST"],
    seoTitle: "Australian Tax Invoice Template | QuickFill",
    seoDescription: "Review this Australian tax invoice template with ABN, GST breakdown, line items and payment details before use.",
    whatIsThis: "A tax invoice is a legal document required for GST-registered businesses in Australia. It must include specific information such as your ABN, the words 'Tax Invoice', itemised goods or services, and GST amounts if applicable.",
    keywords: ["tax invoice", "australian invoice", "gst invoice", "business invoice", "invoice template australia"],
    whoNeedsThis: "You need to issue a tax invoice if you are registered for GST in Australia and have made a taxable sale of goods or services. Your customer requires a valid tax invoice to claim GST credits on their tax return. This applies to all GST-registered businesses regardless of size, from sole traders to large corporations.",
    howToComplete: [
      "Include the words 'Tax Invoice' prominently at the top of the document",
      "Provide your business details including name, ABN, and address",
      "List each item or service separately with quantities, prices, and GST amounts",
      "Show the total amount including GST and indicate the GST amount separately",
      "Include the date of issue, invoice number, and payment terms"
    ],
    commonMistakes: [
      "Missing ABN - without a valid ABN, your invoice is not a valid tax invoice for GST purposes",
      "Incorrect GST calculation - ensure you are charging 10% GST on taxable items only",
      "No unique invoice number - each tax invoice must have a unique identifier for record-keeping"
    ],
    faqs: [
      {
        q: "What is the difference between an invoice and a tax invoice?",
        a: "A regular invoice is a request for payment, while a tax invoice is a specific document required by the ATO that allows the recipient to claim GST credits. A tax invoice must include your ABN, GST amount, and the words 'Tax Invoice'."
      },
      {
        q: "How long must I keep tax invoices?",
        a: "You must keep records of all tax invoices for five years from the date you lodged your relevant Business Activity Statement. Digital records are acceptable if they are readable and accessible."
      },
      {
        q: "Do I need to issue a tax invoice for every sale?",
        a: "You must provide a tax invoice when requested by your customer. For sales under $82.50 (including GST), a simplified tax invoice may be sufficient. For larger amounts, a full tax invoice is required."
      }
    ]
  },
  {
    slug: "employee-details",
    file: "employee-details.pdf",
    title: "New Employee Details Form",
    description: "Collect TFN, bank details, super fund and emergency contact details from new staff.",
    category: "Employment",
    agency: "Australian workplace template",
    pageCount: 2,
    estimatedTime: "5-8 min",
    commonUse: "onboarding a new employee for payroll setup",
    templateType: "genericWorksheet",
    sourceKind: "genericWorksheet",
    badge: "Generic worksheet",
    popular: true,
    tags: ["employment", "new employee", "payroll", "bank details", "super"],
    seoTitle: "Fill New Employee Details Form Online | QuickFill",
    seoDescription: "Fill and preview a new employee details form with TFN, bank account, super fund and emergency contact fields, then unlock the PDF.",
    whatIsThis: "This form collects essential information from new employees including their Tax File Number, bank account details, superannuation fund, and emergency contact information. It's required for setting up payroll and ensuring compliance with Australian employment laws.",
    keywords: ["employee details form", "new employee form", "staff onboarding", "employee registration", "payroll setup form"],
    whoNeedsThis: "Employers need to collect employee details from all new staff members before their first payday. This information is essential for payroll processing, superannuation contributions, tax withholding, and emergency contact purposes. The form ensures compliance with Australian workplace laws and tax requirements.",
    howToComplete: [
      "Have the employee complete their personal details including full name, address, and date of birth",
      "Collect their TFN for tax purposes and bank account details for salary payments",
      "Record their superannuation fund choice or provide a default fund option",
      "Document their employment type (full-time, part-time, or casual) and start date",
      "Collect emergency contact details and any relevant medical information"
    ],
    commonMistakes: [
      "Starting payroll without collecting TFN - this results in withholding tax at the highest rate",
      "Not verifying super fund details - incorrect fund information can lead to lost super contributions",
      "Missing emergency contact information - this is critical for workplace safety and compliance"
    ],
    faqs: [
      {
        q: "Can I start an employee before collecting their details?",
        a: "Yes, you can start an employee before all details are collected, but you must obtain their TFN within 28 days or you must withhold tax at the highest marginal rate. Super choice must be provided within 30 days."
      },
      {
        q: "How long must I keep employee details records?",
        a: "Employers must keep employee records for seven years from the date the record was made. This includes details forms, payslips, and employment agreements."
      },
      {
        q: "Is this form legally required?",
        a: "While there is no single mandated form, collecting this information is required under Australian workplace laws, tax legislation, and superannuation guarantee requirements."
      }
    ]
  },
  {
    slug: "ndis-service-agreement",
    file: "ndis-service-agreement.pdf",
    title: "NDIS Service Agreement",
    description: "Service agreement between an NDIS participant and provider with supports, rates and signatures.",
    category: "NDIS",
    agency: "NDIS provider template",
    pageCount: 2,
    estimatedTime: "8-12 min",
    commonUse: "confirming supports between a participant and provider",
    templateType: "genericWorksheet",
    sourceKind: "genericWorksheet",
    badge: "Generic worksheet",
    tags: ["NDIS", "service agreement", "disability", "provider", "participant"],
    seoTitle: "Fill NDIS Service Agreement Online | QuickFill",
    seoDescription: "Fill and preview an NDIS service agreement with supports, rates and signatures, then unlock the finished PDF.",
    whatIsThis: "An NDIS Service Agreement is a formal agreement between an NDIS participant and their service provider. It outlines the supports and services to be provided, including schedules, costs, and responsibilities of both parties. This is a requirement under NDIS quality and safety standards.",
    keywords: ["ndis service agreement", "ndis provider agreement", "ndis support plan", "disability service agreement", "ndis contract"],
    whoNeedsThis: "NDIS participants and providers must have a service agreement before supports begin. This applies to all NDIS-funded services regardless of whether the provider is registered or unregistered. The agreement ensures both parties understand their rights and responsibilities and is required for NDIS compliance and quality standards.",
    howToComplete: [
      "Clearly describe the supports and services to be provided including frequency and duration",
      "Specify the costs and pricing aligned with the NDIS Price Guide",
      "Outline the responsibilities of both the participant and the provider",
      "Include details about how to vary or terminate the agreement",
      "Both parties must sign and date the agreement before services commence"
    ],
    commonMistakes: [
      "Vague service descriptions - be specific about what supports will be provided and when",
      "Not including cancellation policies - clearly state notice periods and any fees",
      "Missing participant goals - the agreement should reference how supports align with the participant's NDIS plan goals"
    ],
    faqs: [
      {
        q: "Is a service agreement mandatory for all NDIS providers?",
        a: "Yes, the NDIS Commission requires all providers to have a service agreement with participants before providing supports. This applies to both registered and unregistered providers."
      },
      {
        q: "Can I change my service agreement after signing?",
        a: "Yes, service agreements can be varied at any time by mutual consent. Both parties should agree to changes in writing and sign an amendment to the original agreement."
      },
      {
        q: "What happens if the provider does not deliver agreed services?",
        a: "If services are not delivered as agreed, you can request a variation to the agreement or terminate it. You may also contact the NDIS Quality and Safeguards Commission to make a complaint."
      }
    ]
  },
  {
    file: "consent-form.pdf",
    title: "General Consent Form",
    description: "Simple consent and authority form suitable for community, business and personal use.",
    category: "General",
    agency: "Australian template",
    pageCount: 2,
    estimatedTime: "3-5 min",
    commonUse: "recording signed consent or permission",
    templateType: "genericWorksheet",
    sourceKind: "genericWorksheet",
    badge: "Generic worksheet",
    tags: ["consent", "permission", "authority", "signature", "general"]
  },
  {
    slug: "medical-consent",
    file: "medical-consent.pdf",
    title: "Medical Consent Form",
    description: "Patient consent form with Medicare number, allergies, emergency contact and signatures.",
    category: "Healthcare",
    agency: "Australian healthcare template",
    pageCount: 2,
    estimatedTime: "5-8 min",
    commonUse: "recording patient consent before treatment or procedures",
    templateType: "genericWorksheet",
    sourceKind: "genericWorksheet",
    badge: "Generic worksheet",
    tags: ["medical", "health", "consent", "patient", "Medicare"],
    seoTitle: "Fill Medical Consent Form Online | QuickFill",
    seoDescription: "Fill and preview a medical consent form with Medicare details, allergies and an emergency contact, then unlock the finished PDF.",
    whatIsThis: "A medical consent form is used to document a patient's informed consent to medical procedures or treatments. It includes important medical information such as allergies, current medications, and emergency contact details to ensure safe and appropriate care.",
    keywords: ["medical consent form", "patient consent", "health consent", "medical procedure consent", "treatment consent australia"],
    whoNeedsThis: "Patients need to complete a medical consent form before undergoing medical procedures, treatments, or surgeries. Healthcare providers require this form to document that you understand the procedure, its risks, and have given informed consent. This applies to both minor procedures and major surgical interventions.",
    howToComplete: [
      "Provide your personal details including full name, date of birth, and Medicare number",
      "List any known allergies to medications, foods, or materials",
      "Disclose all current medications including prescription, over-the-counter, and supplements",
      "Confirm you understand the procedure, its risks, benefits, and alternatives",
      "Sign and date the form in the presence of your healthcare provider"
    ],
    commonMistakes: [
      "Not disclosing all medications - some medications can interact with anaesthesia or treatment",
      "Signing without understanding - you have the right to ask questions and fully understand before consenting",
      "Omitting allergies - failure to disclose allergies can lead to serious medical complications"
    ],
    faqs: [
      {
        q: "Can I withdraw my consent after signing the form?",
        a: "Yes, you can withdraw your consent at any time before the procedure begins. Inform your healthcare provider immediately if you wish to withdraw consent."
      },
      {
        q: "What if I don't understand the procedure explained to me?",
        a: "You have the right to ask for clarification and have all questions answered before giving consent. Do not sign the form until you fully understand the procedure and its implications."
      },
      {
        q: "Can someone else sign the consent form on my behalf?",
        a: "In most cases, you must sign your own consent form. If you lack capacity or are a minor, a legal guardian or authorised person may sign on your behalf."
      }
    ]
  },
  {
    file: "bank-account-change.pdf",
    title: "Bank Account Update Request",
    description: "Update bank account details with an employer, super fund or organisation.",
    category: "Finance",
    agency: "Australian finance template",
    pageCount: 2,
    estimatedTime: "3-5 min",
    commonUse: "changing payment details with an organisation",
    templateType: "genericWorksheet",
    sourceKind: "genericWorksheet",
    badge: "Generic worksheet",
    tags: ["bank", "payment", "finance", "account", "payroll"]
  },
  {
    file: "insurance-claim.pdf",
    title: "Insurance Claim Form",
    description: "General insurance claim form for home, motor and personal property claims.",
    category: "Insurance",
    agency: "Australian insurance template",
    pageCount: 2,
    estimatedTime: "8-12 min",
    commonUse: "lodging an insurance claim with supporting details",
    templateType: "genericWorksheet",
    sourceKind: "genericWorksheet",
    badge: "Generic worksheet",
    tags: ["insurance", "claim", "home", "motor", "property"]
  }
];

/**
 * Get a template by its slug
 */
export function hasTemplateLandingPage(template: TemplateConfig): template is TemplatePageConfig {
  return typeof template.slug === "string";
}

export function getTemplateBySlug(slug: string): TemplatePageConfig | undefined {
  return templates.find(
    (template): template is TemplatePageConfig => hasTemplateLandingPage(template) && template.slug === slug,
  );
}

export function isTemplateFillable(template: TemplateDirectoryItem): boolean {
  return template.allowFill !== false;
}

export function isTemplateIndexable(template: TemplateDirectoryItem): boolean {
  return template.indexable !== false;
}

/**
 * Get related templates (same category, excluding current)
 */
export function getRelatedTemplates(currentSlug: string, limit: number = 3): TemplatePageConfig[] {
  const current = getTemplateBySlug(currentSlug);
  if (!current) return [];

  return templates
    .filter(
      (template): template is TemplatePageConfig =>
        hasTemplateLandingPage(template) &&
        template.category === current.category &&
        template.slug !== currentSlug &&
        isTemplateIndexable(template) &&
        isTemplateFillable(template),
    )
    .slice(0, limit);
}

/**
 * Get all template slugs for static route generation
 */
export function getTemplateSlugs(): string[] {
  return templates.filter(hasTemplateLandingPage).map((template) => template.slug);
}

/**
 * Get indexable template slugs for sitemap generation
 */
export function getIndexableTemplateSlugs(): string[] {
  return templates
    .filter(
      (template): template is TemplatePageConfig =>
        hasTemplateLandingPage(template) && isTemplateIndexable(template),
    )
    .map((template) => template.slug);
}
