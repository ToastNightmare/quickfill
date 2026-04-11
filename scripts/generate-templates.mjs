import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '../public/templates');
mkdirSync(outDir, { recursive: true });

async function createForm(title, fields) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();

  // Header bar
  page.drawRectangle({ x: 0, y: height - 80, width, height: 80, color: rgb(0.18, 0.18, 0.35) });
  page.drawText('QuickFill', { x: 40, y: height - 30, size: 11, font, color: rgb(1, 1, 1) });
  page.drawText(title, { x: 40, y: height - 55, size: 18, font: boldFont, color: rgb(1, 1, 1) });

  // Divider
  page.drawLine({ start: { x: 40, y: height - 100 }, end: { x: width - 40, y: height - 100 }, thickness: 1, color: rgb(0.8, 0.8, 0.8) });

  // Fields
  let y = height - 140;
  for (const field of fields) {
    if (field.type === 'section') {
      page.drawText(field.label, { x: 40, y, size: 11, font: boldFont, color: rgb(0.2, 0.2, 0.2) });
      y -= 8;
      page.drawLine({ start: { x: 40, y }, end: { x: width - 40, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
      y -= 24;
      continue;
    }

    // Label
    page.drawText(field.label, { x: 40, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
    y -= 18;

    // Field box
    const fieldWidth = field.full ? width - 80 : (width - 100) / 2;
    const fieldX = field.right ? (width / 2) + 10 : 40;
    page.drawRectangle({ x: fieldX, y: y - 4, width: fieldWidth, height: 24, borderColor: rgb(0.7, 0.7, 0.7), borderWidth: 1, color: rgb(0.98, 0.98, 0.98) });

    // AcroForm text field
    const form = doc.getForm();
    const tf = form.createTextField(field.id || field.label.replace(/\s+/g, '_').toLowerCase());
    tf.addToPage(page, { x: fieldX, y: y - 4, width: fieldWidth, height: 24, textColor: rgb(0, 0, 0), backgroundColor: rgb(0.98, 0.98, 0.98), borderColor: rgb(0.7, 0.7, 0.7), borderWidth: 1 });

    if (!field.right) y -= 36;
    else y -= 0;
  }

  const bytes = await doc.save();
  return bytes;
}

async function main() {
  console.log('Generating Australian form templates...');

  // Form 1: Tax File Number Declaration
  const tfnBytes = await createForm('Tax File Number Declaration', [
    { label: 'Full Name', full: true, id: 'full_name' },
    { label: 'Date of Birth', half: true, id: 'date_of_birth' },
    { label: 'Gender', half: true, id: 'gender' },
    { label: 'Home Address', full: true, id: 'home_address' },
    { label: 'Suburb', half: true, id: 'suburb' },
    { label: 'State', half: true, id: 'state' },
    { label: 'Postcode', half: true, id: 'postcode' },
    { label: 'Country', half: true, id: 'country' },
    { label: 'TFN', full: true, id: 'tfn' },
    { label: 'Are you an Australian resident for tax purposes?', full: true, id: 'australian_resident' },
    { label: 'Signature', full: true, id: 'signature' },
    { label: 'Date', half: true, id: 'date' },
  ]);
  writeFileSync(join(outDir, 'ato-tfn-declaration.pdf'), tfnBytes);
  console.log('Created: ato-tfn-declaration.pdf');

  // Form 2: Tax Invoice
  const invoiceBytes = await createForm('Tax Invoice', [
    { label: 'From Business Name', full: true, id: 'from_business_name' },
    { label: 'ABN', half: true, id: 'abn' },
    { label: 'Date', half: true, id: 'date' },
    { label: 'Invoice Number', half: true, id: 'invoice_number' },
    { label: 'To Name', full: true, id: 'to_name' },
    { label: 'To Address', full: true, id: 'to_address' },
    { label: 'Description', full: true, id: 'description' },
    { label: 'Amount', half: true, id: 'amount' },
    { label: 'GST', half: true, id: 'gst' },
    { label: 'Total', half: true, id: 'total' },
    { label: 'Payment Details - BSB', half: true, id: 'bsb' },
    { label: 'Account Number', half: true, id: 'account_number' },
    { label: 'Bank Name', full: true, id: 'bank_name' },
    { label: 'Notes', full: true, id: 'notes' },
  ]);
  writeFileSync(join(outDir, 'australian-invoice.pdf'), invoiceBytes);
  console.log('Created: australian-invoice.pdf');

  // Form 3: Rental Application
  const rentalBytes = await createForm('Rental Application', [
    { label: 'Property Address', full: true, id: 'property_address' },
    { label: 'Weekly Rent', half: true, id: 'weekly_rent' },
    { label: 'Lease Start Date', half: true, id: 'lease_start_date' },
    { label: 'Applicant Full Name', full: true, id: 'applicant_full_name' },
    { label: 'Date of Birth', half: true, id: 'date_of_birth' },
    { label: 'Phone', half: true, id: 'phone' },
    { label: 'Email', full: true, id: 'email' },
    { label: 'Current Address', full: true, id: 'current_address' },
    { label: 'Employer', full: true, id: 'employer' },
    { label: 'Annual Income', half: true, id: 'annual_income' },
    { label: 'Employment Type', half: true, id: 'employment_type' },
    { label: 'Emergency Contact Name', full: true, id: 'emergency_contact_name' },
    { label: 'Emergency Contact Phone', half: true, id: 'emergency_contact_phone' },
    { label: 'Signature', half: true, id: 'signature' },
    { label: 'Date', half: true, id: 'date' },
  ]);
  writeFileSync(join(outDir, 'rental-application.pdf'), rentalBytes);
  console.log('Created: rental-application.pdf');

  // Form 4: Employee Details Form
  const employeeBytes = await createForm('Employee Details Form', [
    { label: 'Full Name', full: true, id: 'full_name' },
    { label: 'Date of Birth', half: true, id: 'date_of_birth' },
    { label: 'Phone', half: true, id: 'phone' },
    { label: 'Home Address', full: true, id: 'home_address' },
    { label: 'TFN', half: true, id: 'tfn' },
    { label: 'Medicare Number', half: true, id: 'medicare_number' },
    { label: 'Bank Name', full: true, id: 'bank_name' },
    { label: 'BSB', half: true, id: 'bsb' },
    { label: 'Account Number', half: true, id: 'account_number' },
    { label: 'Super Fund Name', full: true, id: 'superfund_name' },
    { label: 'Super Member Number', half: true, id: 'superfund_member_number' },
    { label: 'Signature', half: true, id: 'signature' },
    { label: 'Date', half: true, id: 'date' },
  ]);
  writeFileSync(join(outDir, 'employee-details.pdf'), employeeBytes);
  console.log('Created: employee-details.pdf');

  // Form 5: General Consent Form
  const consentBytes = await createForm('General Consent Form', [
    { label: 'Full Name', full: true, id: 'full_name' },
    { label: 'Date of Birth', half: true, id: 'date_of_birth' },
    { label: 'Phone', half: true, id: 'phone' },
    { label: 'Email', full: true, id: 'email' },
    { label: 'Purpose / Description', full: true, id: 'purpose_description' },
    { label: 'I consent to the above', full: true, id: 'consent_statement' },
    { label: 'Signature', full: true, id: 'signature' },
    { label: 'Date', half: true, id: 'date' },
    { label: 'Witness Name', half: true, id: 'witness_name' },
    { label: 'Witness Signature', half: true, id: 'witness_signature' },
  ]);
  writeFileSync(join(outDir, 'consent-form.pdf'), consentBytes);
  console.log('Created: consent-form.pdf');

  // Form 6: NDIS Service Agreement
  const ndisBytes = await createForm('NDIS Service Agreement', [
    { label: 'Participant Name', full: true, id: 'participant_name' },
    { label: 'Participant NDIS Number', half: true, id: 'ndis_number' },
    { label: 'Date of Birth', half: true, id: 'date_of_birth' },
    { label: 'Support Coordinator Name', full: true, id: 'support_coordinator' },
    { label: 'Provider Name', full: true, id: 'provider_name' },
    { label: 'Provider ABN', half: true, id: 'provider_abn' },
    { label: 'Agreement Start Date', half: true, id: 'start_date' },
    { label: 'Agreement End Date', half: true, id: 'end_date' },
    { label: 'Support Category', full: true, id: 'support_category' },
    { label: 'Support Description', full: true, id: 'support_description' },
    { label: 'Weekly Hours', half: true, id: 'weekly_hours' },
    { label: 'Hourly Rate', half: true, id: 'hourly_rate' },
    { label: 'Total Weekly Cost', half: true, id: 'total_weekly_cost' },
    { label: 'Participant Signature', half: true, id: 'participant_signature' },
    { label: 'Date', half: true, id: 'participant_date' },
    { label: 'Provider Signature', half: true, id: 'provider_signature' },
    { label: 'Provider Date', half: true, id: 'provider_date' },
  ]);
  writeFileSync(join(outDir, 'ndis-service-agreement.pdf'), ndisBytes);
  console.log('Created: ndis-service-agreement.pdf');

  // Form 7: Employment Separation Certificate
  const separationBytes = await createForm('Employment Separation Certificate', [
    { label: 'Employee Full Name', full: true, id: 'employee_name' },
    { label: 'TFN', half: true, id: 'tfn' },
    { label: 'Date of Birth', half: true, id: 'date_of_birth' },
    { label: 'Employer Business Name', full: true, id: 'employer_name' },
    { label: 'Employer ABN', half: true, id: 'employer_abn' },
    { label: 'Employment Start Date', half: true, id: 'employment_start' },
    { label: 'Last Day of Work', half: true, id: 'last_day' },
    { label: 'Reason for Leaving', full: true, id: 'reason_leaving' },
    { label: 'Final Pay Amount', half: true, id: 'final_pay' },
    { label: 'Leave Entitlements Paid', half: true, id: 'leave_paid' },
    { label: 'Employer Signature', full: true, id: 'employer_signature' },
    { label: 'Date', half: true, id: 'date' },
  ]);
  writeFileSync(join(outDir, 'employment-separation.pdf'), separationBytes);
  console.log('Created: employment-separation.pdf');

  // Form 8: Bank Account Change Request
  const bankBytes = await createForm('Bank Account Change Request', [
    { label: 'Full Name', full: true, id: 'full_name' },
    { label: 'Date of Birth', half: true, id: 'date_of_birth' },
    { label: 'Phone', half: true, id: 'phone' },
    { label: 'Email', full: true, id: 'email' },
    { label: 'Account Holder Name', full: true, id: 'account_holder' },
    { label: 'New Bank Name', full: true, id: 'bank_name' },
    { label: 'New BSB', half: true, id: 'bsb' },
    { label: 'New Account Number', half: true, id: 'account_number' },
    { label: 'Effective Date', half: true, id: 'effective_date' },
    { label: 'Reason for Change', full: true, id: 'reason_change' },
    { label: 'Signature', half: true, id: 'signature' },
    { label: 'Date', half: true, id: 'date' },
  ]);
  writeFileSync(join(outDir, 'bank-account-change.pdf'), bankBytes);
  console.log('Created: bank-account-change.pdf');

  // Form 9: Insurance Claim Form
  const insuranceBytes = await createForm('Insurance Claim Form', [
    { label: 'Policy Number', half: true, id: 'policy_number' },
    { label: 'Claim Date', half: true, id: 'claim_date' },
    { label: 'Insured Name', full: true, id: 'insured_name' },
    { label: 'Date of Birth', half: true, id: 'date_of_birth' },
    { label: 'Phone', half: true, id: 'phone' },
    { label: 'Email', full: true, id: 'email' },
    { label: 'Incident Date', half: true, id: 'incident_date' },
    { label: 'Incident Location', full: true, id: 'incident_location' },
    { label: 'Description of Incident', full: true, id: 'incident_description' },
    { label: 'Estimated Loss Amount', half: true, id: 'loss_amount' },
    { label: 'Police Report Number', half: true, id: 'police_report' },
    { label: 'Witness Name', full: true, id: 'witness_name' },
    { label: 'Witness Phone', half: true, id: 'witness_phone' },
    { label: 'Signature', half: true, id: 'signature' },
    { label: 'Date', half: true, id: 'date' },
  ]);
  writeFileSync(join(outDir, 'insurance-claim.pdf'), insuranceBytes);
  console.log('Created: insurance-claim.pdf');

  // Form 10: Medical Consent Form
  const medicalBytes = await createForm('Medical Consent Form', [
    { label: 'Patient Full Name', full: true, id: 'patient_name' },
    { label: 'Date of Birth', half: true, id: 'date_of_birth' },
    { label: 'Medicare Number', half: true, id: 'medicare_number' },
    { label: 'Phone', full: true, id: 'phone' },
    { label: 'Address', full: true, id: 'address' },
    { label: 'GP Name', full: true, id: 'gp_name' },
    { label: 'Procedure or Treatment', full: true, id: 'procedure' },
    { label: 'I consent to the above treatment', full: true, id: 'consent_statement' },
    { label: 'Emergency Contact Name', half: true, id: 'emergency_contact' },
    { label: 'Emergency Contact Phone', half: true, id: 'emergency_phone' },
    { label: 'Patient Signature', half: true, id: 'patient_signature' },
    { label: 'Date', half: true, id: 'patient_date' },
    { label: 'Guardian Signature (if applicable)', half: true, id: 'guardian_signature' },
    { label: 'Guardian Date', half: true, id: 'guardian_date' },
  ]);
  writeFileSync(join(outDir, 'medical-consent.pdf'), medicalBytes);
  console.log('Created: medical-consent.pdf');

  console.log('\nAll templates generated successfully!');
  console.log(`Output directory: ${outDir}`);
}

main().catch(console.error);
