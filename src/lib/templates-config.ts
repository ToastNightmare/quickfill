export interface TemplateConfig {
  slug: string;
  file: string;
  title: string;
  description: string;
  category: string;
  seoTitle: string;
  seoDescription: string;
  whatIsThis: string;
  keywords: string[];
  emoji: string;
}

export const templates: TemplateConfig[] = [
  {
    slug: "tfn-declaration",
    file: "ato-tfn-declaration.pdf",
    title: "Tax File Number Declaration",
    description: "Official ATO form (NAT 3092) for declaring your TFN to your employer.",
    category: "ATO",
    seoTitle: "Fill TFN Declaration Online Free | QuickFill Australia",
    seoDescription: "Fill your TFN Declaration form (NAT 3092) online for free. Official ATO form for new employees. No signup required.",
    whatIsThis: "The Tax File Number (TFN) Declaration is an official ATO form that you must complete when starting a new job. It tells your employer how much tax to withhold from your pay based on your tax circumstances.",
    keywords: ["tfn declaration", "tfn form", "ato tfn", "NAT 3092", "tax file number declaration"],
    emoji: "🏛️"
  },
  {
    slug: "super-choice",
    file: "ato-super-choice.pdf",
    title: "Superannuation Standard Choice",
    description: "Official ATO form (NAT 13080) to choose your super fund.",
    category: "ATO",
    seoTitle: "Superannuation Choice Form Online | Fill NAT 13080 Free",
    seoDescription: "Fill your Superannuation Standard Choice form (NAT 13080) online for free. Tell your employer which super fund to use.",
    whatIsThis: "The Superannuation Standard Choice form allows you to nominate which superannuation fund you want your employer to pay your super contributions into. This is your right under Australian law.",
    keywords: ["super choice form", "superannuation choice", "NAT 13080", "choose super fund", "super nomination"],
    emoji: "🏦"
  },
  {
    slug: "employment-separation",
    file: "employment-separation.pdf",
    title: "Employment Separation Certificate",
    description: "Official Centrelink form for when you leave a job.",
    category: "Services Australia",
    seoTitle: "Fill Centrelink Employment Separation Certificate Online",
    seoDescription: "Download and fill the Employment Separation Certificate (SU001) online. Required by Centrelink when claiming income support after leaving a job.",
    whatIsThis: "An Employment Separation Certificate is required by Centrelink when you leave a job and want to claim income support. Your employer must complete this form to verify your employment details and reason for leaving.",
    keywords: ["employment separation certificate", "centrelink separation", "SU001", "separation form", "leave job centrelink"],
    emoji: "📄"
  },
  {
    slug: "medicare-enrolment",
    file: "medicare-enrolment.pdf",
    title: "Medicare Enrolment Form",
    description: "Official Services Australia form (MS004) for new Medicare card applications.",
    category: "Services Australia",
    seoTitle: "Medicare Enrolment Form Online | Fill MS004 Free",
    seoDescription: "Apply for a Medicare card online with the official MS004 enrolment form. For new residents and Australian citizens.",
    whatIsThis: "The Medicare Enrolment form is used to apply for a Medicare card if you're a new Australian resident or citizen. Medicare provides access to subsidised healthcare services across Australia.",
    keywords: ["medicare enrolment", "medicare card application", "MS004", "medicare form", "apply medicare"],
    emoji: "🏥"
  },
  {
    slug: "statutory-declaration",
    file: "statutory-declaration.pdf",
    title: "Statutory Declaration Form",
    description: "Official form for making legal declarations in Australia.",
    category: "Legal",
    seoTitle: "Statutory Declaration Form Online Australia | FillFree",
    seoDescription: "Fill and download a statutory declaration form online for free. Official Australian format with witness section.",
    whatIsThis: "A statutory declaration is a written statement of fact that you declare to be true. It must be signed in the presence of an authorised witness such as a justice of the peace, lawyer, or police officer.",
    keywords: ["statutory declaration", "stat dec", "legal declaration", "witness declaration", "australian statutory declaration"],
    emoji: "⚖️"
  },
  {
    slug: "centrelink-su415",
    file: "centrelink-su415.pdf",
    title: "Centrelink Income and Assets Form SU415",
    description: "Services Australia form for declaring income and assets.",
    category: "Centrelink",
    seoTitle: "Centrelink Income and Assets Form SU415 | Fill Online Free",
    seoDescription: "Complete the SU415 income and assets declaration form online. Required for Centrelink payment assessments and reviews.",
    whatIsThis: "The SU415 form is used by Centrelink to assess your income and assets for payment eligibility. You'll need to provide details about your employment, other income, bank accounts, investments, and property.",
    keywords: ["SU415", "centrelink income assets", "income declaration", "assets form", "centrelink assessment"],
    emoji: "💼"
  },
  {
    slug: "rental-application-nsw",
    file: "tenancy-application-nsw.pdf",
    title: "NSW Rental Application Form",
    description: "New South Wales residential tenancy application.",
    category: "Real Estate",
    seoTitle: "NSW Rental Application Form Online | Fill Free",
    seoDescription: "Complete your NSW rental application form online. Standard residential tenancy application for New South Wales properties.",
    whatIsThis: "This is the standard rental application form used by landlords and property managers in New South Wales. It collects information about your identity, employment, rental history, and references to assess your tenancy application.",
    keywords: ["rental application nsw", "tenancy application nsw", "rental form nsw", "nsw lease application", "rent application"],
    emoji: "🏠"
  },
  {
    slug: "rental-application-vic",
    file: "tenancy-application-vic.pdf",
    title: "VIC Rental Application Form",
    description: "Victoria residential tenancy application.",
    category: "Real Estate",
    seoTitle: "VIC Rental Application Form Online | Fill Free",
    seoDescription: "Complete your Victorian rental application form online. Standard residential tenancy application for Victoria properties.",
    whatIsThis: "This is the standard rental application form used by landlords and property managers in Victoria. It collects information about your identity, employment, rental history, and references in accordance with Victorian tenancy laws.",
    keywords: ["rental application vic", "tenancy application vic", "rental form victoria", "vic lease application", "rent application victoria"],
    emoji: "🏡"
  },
  {
    slug: "super-hardship",
    file: "superannuation-hardship.pdf",
    title: "Superannuation Early Release - Financial Hardship",
    description: "Apply for early release of super on financial hardship grounds.",
    category: "Superannuation",
    seoTitle: "Super Early Release Financial Hardship Form | Fill Online",
    seoDescription: "Apply for early release of your superannuation due to financial hardship. Complete the application form online.",
    whatIsThis: "This form allows you to apply for early release of your superannuation on the grounds of financial hardship. You must meet specific criteria set by the Australian Prudential Regulation Authority (APRA) and provide evidence of your financial situation.",
    keywords: ["super hardship", "early release super", "financial hardship super", "superannuation release", "compassionate grounds"],
    emoji: "📥"
  },
  {
    slug: "tax-invoice",
    file: "australian-invoice.pdf",
    title: "Australian Tax Invoice Template",
    description: "Professional tax invoice for Australian businesses.",
    category: "Business",
    seoTitle: "Australian Tax Invoice Template | Fill Online Free",
    seoDescription: "Create professional Australian tax invoices online. Includes ABN, GST breakdown, and payment details. Free to use.",
    whatIsThis: "A tax invoice is a legal document required for GST-registered businesses in Australia. It must include specific information such as your ABN, the words 'Tax Invoice', itemised goods or services, and GST amounts if applicable.",
    keywords: ["tax invoice", "australian invoice", "gst invoice", "business invoice", "invoice template australia"],
    emoji: "🧾"
  },
  {
    slug: "employee-details",
    file: "employee-details.pdf",
    title: "New Employee Details Form",
    description: "Collect essential information from new staff members.",
    category: "Employment",
    seoTitle: "New Employee Details Form Australia | Fill Online",
    seoDescription: "Collect new employee details including TFN, bank account, and super fund. Essential for payroll setup in Australia.",
    whatIsThis: "This form collects essential information from new employees including their Tax File Number, bank account details, superannuation fund, and emergency contact information. It's required for setting up payroll and ensuring compliance with Australian employment laws.",
    keywords: ["employee details form", "new employee form", "staff onboarding", "employee registration", "payroll setup form"],
    emoji: "👤"
  },
  {
    slug: "ndis-service-agreement",
    file: "ndis-service-agreement.pdf",
    title: "NDIS Service Agreement",
    description: "Compliant service agreement between NDIS participant and provider.",
    category: "NDIS",
    seoTitle: "NDIS Service Agreement Form | Fill Online Free",
    seoDescription: "Complete NDIS service agreement between participant and provider. Includes support schedule, rates, and signatures.",
    whatIsThis: "An NDIS Service Agreement is a formal agreement between an NDIS participant and their service provider. It outlines the supports and services to be provided, including schedules, costs, and responsibilities of both parties. This is a requirement under NDIS quality and safety standards.",
    keywords: ["ndis service agreement", "ndis provider agreement", "ndis support plan", "disability service agreement", "ndis contract"],
    emoji: "♿"
  },
  {
    slug: "medical-consent",
    file: "medical-consent.pdf",
    title: "Medical Consent Form",
    description: "Patient consent for medical procedures and treatments.",
    category: "Healthcare",
    seoTitle: "Medical Consent Form Australia | Fill Online Free",
    seoDescription: "Complete a medical consent form online. Patient consent for procedures and treatments with Medicare details and emergency contact.",
    whatIsThis: "A medical consent form is used to document a patient's informed consent to medical procedures or treatments. It includes important medical information such as allergies, current medications, and emergency contact details to ensure safe and appropriate care.",
    keywords: ["medical consent form", "patient consent", "health consent", "medical procedure consent", "treatment consent australia"],
    emoji: "⚕️"
  }
];

/**
 * Get a template by its slug
 */
export function getTemplateBySlug(slug: string): TemplateConfig | undefined {
  return templates.find(t => t.slug === slug);
}

/**
 * Get related templates (same category, excluding current)
 */
export function getRelatedTemplates(currentSlug: string, limit: number = 3): TemplateConfig[] {
  const current = getTemplateBySlug(currentSlug);
  if (!current) return [];
  
  return templates
    .filter(t => t.category === current.category && t.slug !== currentSlug)
    .slice(0, limit);
}

/**
 * Get all template slugs for sitemap generation
 */
export function getTemplateSlugs(): string[] {
  return templates.map(t => t.slug);
}
