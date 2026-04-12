#!/usr/bin/env python3
"""Generate PDF templates for QuickFill forms."""

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, PageBreak, TableStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
import os

# Output directory
OUTPUT_DIR = "/home/kyle/projects/quickfill/public/templates"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Page dimensions
PAGE_WIDTH, PAGE_HEIGHT = A4
MARGIN = 2 * cm

# Styles
styles = getSampleStyleSheet()

# Custom styles
title_style = ParagraphStyle(
    'CustomTitle',
    parent=styles['Heading1'],
    fontSize=18,
    textColor=colors.HexColor('#1e40af'),
    spaceAfter=12,
    alignment=TA_CENTER,
    fontName='Helvetica-Bold'
)

section_style = ParagraphStyle(
    'SectionTitle',
    parent=styles['Heading2'],
    fontSize=14,
    textColor=colors.HexColor('#3b82f6'),
    spaceAfter=8,
    spaceBefore=12,
    fontName='Helvetica-Bold'
)

body_style = ParagraphStyle(
    'BodyText',
    parent=styles['BodyText'],
    fontSize=10,
    leading=14,
    spaceAfter=6
)

small_style = ParagraphStyle(
    'SmallText',
    parent=styles['BodyText'],
    fontSize=8,
    leading=10,
    textColor=colors.HexColor('#6b7280')
)

footer_style = ParagraphStyle(
    'Footer',
    parent=styles['BodyText'],
    fontSize=7,
    textColor=colors.HexColor('#9ca3af'),
    alignment=TA_CENTER
)

# Form field box style
field_box_style = TableStyle([
    ('BACKGROUND', (0, 0), (-1, -1), colors.white),
    ('BOX', (0, 0), (-1, -1), 0.5, colors.grey),
    ('GRID', (0, 0), (-1, -1), 0.25, colors.lightgrey),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('LEFTPADDING', (0, 0), (-1, -1), 6),
    ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ('TOPPADDING', (0, 0), (-1, -1), 4),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
])

section_box_style = TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#eff6ff')),
    ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#3b82f6')),
    ('GRID', (0, 0), (-1, -1), 0.25, colors.lightgrey),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('LEFTPADDING', (0, 0), (-1, -1), 8),
    ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ('TOPPADDING', (0, 0), (-1, -1), 6),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
])


def add_header(story, title, subtitle=None):
    """Add a standard header to the form."""
    # Header box
    header_data = [[Paragraph(f"<b>{title}</b>", title_style)]]
    if subtitle:
        header_data[0].append(Paragraph(subtitle, body_style))
    
    header_table = Table(header_data, colWidths=[PAGE_WIDTH - 2 * MARGIN])
    header_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#eff6ff')),
        ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#3b82f6')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 12),
        ('RIGHTPADDING', (0, 0), (-1, -1), 12),
        ('TOPPADDING', (0, 0), (-1, -1), 12),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 0.5 * cm))


def add_section(story, title, content):
    """Add a section with title and content."""
    story.append(Paragraph(f"<b>{title}</b>", section_style))
    if isinstance(content, list):
        for item in content:
            story.append(Paragraph(item, body_style))
    else:
        story.append(Paragraph(content, body_style))
    story.append(Spacer(1, 0.3 * cm))


def add_field_row(story, label, width_ratio=0.3):
    """Add a row with label and empty field."""
    field_width = (PAGE_WIDTH - 2 * MARGIN) * (1 - width_ratio)
    data = [[Paragraph(label, body_style), ""]]
    field_table = Table(data, colWidths=[PAGE_WIDTH - 2 * MARGIN - field_width, field_width])
    field_table.setStyle(field_box_style)
    story.append(field_table)
    story.append(Spacer(1, 3))


def add_footer(story, text):
    """Add a footer to the form."""
    story.append(Spacer(1, 1 * cm))
    footer = Table([[Paragraph(text, footer_style)]], colWidths=[PAGE_WIDTH - 2 * MARGIN])
    footer.setStyle(TableStyle([
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#e5e7eb')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 12),
        ('RIGHTPADDING', (0, 0), (-1, -1), 12),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f9fafb')),
    ]))
    story.append(footer)


# ============================================================================
# 1. Statutory Declaration
# ============================================================================
def generate_statutory_declaration():
    """Generate statutory declaration form."""
    filepath = os.path.join(OUTPUT_DIR, "statutory-declaration.pdf")
    doc = SimpleDocTemplate(filepath, pagesize=A4)
    story = []

    add_header(story, "STATUTORY DECLARATION", "Under the Statutory Declarations Act 2005")
    
    # Declaration text area
    add_section(story, "DECLARATION", [
        "I, ________________________________, of ________________________________",
        "(full name)                                                                 (address)",
        "",
        "do solemnly and sincerely declare that:",
        "",
        "1. _________________________________________________________________",
        "2. _________________________________________________________________",
        "3. _________________________________________________________________",
        "4. _________________________________________________________________",
        "5. _________________________________________________________________",
        "",
        "And I make this solemn declaration conscientiously believing the same to be",
        "true and by virtue of the provisions of the Statutory Declarations Act 2005."
    ])
    story.append(Spacer(1, 0.5 * cm))
    
    # Declaration statement
    add_section(story, "Declaration Statement", [
        "I acknowledge that making a false statement in a statutory declaration is a criminal offence "
        "punishable by imprisonment."
    ])
    story.append(Spacer(1, 0.5 * cm))
    
    # Witness section
    add_section(story, "WITNESS", [
        "Declared before me:"
    ])
    witness_data = [
        ["", ""],
        ["Witness Signature:", ""],
        ["", ""],
        ["Witness Name:", ""],
        ["", ""],
        ["Witness Qualification:", ""],
        ["", ""],
        ["Date:", ""],
    ]
    witness_table = Table(witness_data, colWidths=[4 * cm, PAGE_WIDTH - 2 * MARGIN - 4 * cm])
    witness_table.setStyle(field_box_style)
    story.append(witness_table)
    
    add_footer(story, "WARNING: It is a criminal offence to make a false statutory declaration. "
                    "Penalties include imprisonment for up to 4 years.")
    
    doc.build(story)
    print(f"Generated: {filepath}")


# ============================================================================
# 2. Centrelink SU415 Form
# ============================================================================
def generate_centrelink_su415():
    """Generate Centrelink income/assets form (SU415)."""
    filepath = os.path.join(OUTPUT_DIR, "centrelink-su415.pdf")
    doc = SimpleDocTemplate(filepath, pagesize=A4)
    story = []

    add_header(story, "INCOME AND ASSETS DECLARATION", "Services Australia Form SU415")
    
    # Section A: Personal Details
    add_section(story, "SECTION A - PERSONAL DETAILS", [
        "Provide your personal details as they appear on your Medicare card.",
    ])
    add_field_row(story, "Full Name:")
    add_field_row(story, "Date of Birth:")
    add_field_row(story, "Medicare Number:")
    add_field_row(story, "Customer Reference Number (CRN):")
    story.append(Spacer(1, 0.3 * cm))
    
    # Section B: Employment Income
    add_section(story, "SECTION B - EMPLOYMENT INCOME", [
        "Declare all income from employment including salary, wages, commissions, and bonuses.",
    ])
    add_field_row(story, "Employer Name:")
    add_field_row(story, "Employment Start Date:")
    add_field_row(story, "Gross Weekly Income ($):")
    add_field_row(story, "Gross Monthly Income ($):")
    add_field_row(story, "Pay Frequency (Weekly/Fortnightly/Monthly):")
    story.append(Spacer(1, 0.3 * cm))
    
    # Section C: Other Income
    add_section(story, "SECTION C - OTHER INCOME", [
        "Declare any other income sources including pensions, allowances, investments, or rental income.",
    ])
    add_field_row(story, "Source of Other Income:")
    add_field_row(story, "Amount per Week ($):")
    add_field_row(story, "Amount per Fortnight ($):")
    add_field_row(story, "Amount per Month ($):")
    story.append(Spacer(1, 0.3 * cm))
    
    # Section D: Assets
    add_section(story, "SECTION D - ASSETS", [
        "Declare all assets including property, vehicles, investments, and savings.",
    ])
    add_field_row(story, "Property Address (if applicable):")
    add_field_row(story, "Estimated Property Value ($):")
    add_field_row(story, "Vehicle Make/Model:")
    add_field_row(story, "Estimated Vehicle Value ($):")
    add_field_row(story, "Total Savings/Investments ($):")
    story.append(Spacer(1, 0.3 * cm))
    
    # Section E: Partner Details
    add_section(story, "SECTION E - PARTNER DETAILS", [
        "If you have a partner, provide their details and income information.",
    ])
    add_field_row(story, "Partner Full Name:")
    add_field_row(story, "Partner Date of Birth:")
    add_field_row(story, "Partner Income per Fortnight ($):")
    add_field_row(story, "Partner Employment Status:")
    
    add_footer(story, "I declare that the information provided is true and correct. "
                    "I understand that providing false information may result in penalties.")
    
    doc.build(story)
    print(f"Generated: {filepath}")


# ============================================================================
# 3. Tenancy Application NSW
# ============================================================================
def generate_tenancy_nsw():
    """Generate NSW rental application form."""
    filepath = os.path.join(OUTPUT_DIR, "tenancy-application-nsw.pdf")
    doc = SimpleDocTemplate(filepath, pagesize=A4)
    story = []

    add_header(story, "RENTAL APPLICATION FORM", "New South Wales")
    
    # Section 1: Applicant Details
    add_section(story, "1. APPLICANT DETAILS", [
        "Provide details for all adults who will occupy the property.",
    ])
    add_field_row(story, "Full Name:")
    add_field_row(story, "Date of Birth:")
    add_field_row(story, "Phone Number:")
    add_field_row(story, "Email Address:")
    add_field_row(story, "Current Address:")
    add_field_row(story, "Length at Current Address:")
    story.append(Spacer(1, 0.3 * cm))
    
    # Section 2: Employment Details
    add_section(story, "2. EMPLOYMENT DETAILS", [
        "Provide current employment information.",
    ])
    add_field_row(story, "Employer Name:")
    add_field_row(story, "Job Title:")
    add_field_row(story, "Length of Employment:")
    add_field_row(story, "Gross Weekly Income ($):")
    story.append(Spacer(1, 0.3 * cm))
    
    # Section 3: Rental History
    add_section(story, "3. RENTAL HISTORY", [
        "Provide details of your previous rental accommodation.",
    ])
    add_field_row(story, "Previous Address:")
    add_field_row(story, "Landlord/Agent Name:")
    add_field_row(story, "Landlord/Agent Phone:")
    add_field_row(story, "Length of Tenancy:")
    add_field_row(story, "Reason for Leaving:")
    story.append(Spacer(1, 0.3 * cm))
    
    # Section 4: References
    add_section(story, "4. PERSONAL REFERENCES", [
        "Provide two personal references (not relatives).",
    ])
    add_field_row(story, "Reference 1 Name:")
    add_field_row(story, "Reference 1 Phone:")
    add_field_row(story, "Reference 1 Relationship:")
    story.append(Spacer(1, 0.2 * cm))
    add_field_row(story, "Reference 2 Name:")
    add_field_row(story, "Reference 2 Phone:")
    add_field_row(story, "Reference 2 Relationship:")
    story.append(Spacer(1, 0.3 * cm))
    
    # Section 5: Identification
    add_section(story, "5. IDENTIFICATION", [
        "Provide details of identification documents (Driver Licence, Passport, Medicare Card).",
    ])
    add_field_row(story, "Driver Licence Number:")
    add_field_row(story, "Passport Number (if applicable):")
    add_field_row(story, "Medicare Number:")
    story.append(Spacer(1, 0.3 * cm))
    
    # Section 6: Additional Occupants
    add_section(story, "6. ADDITIONAL OCCUPANTS", [
        "List any other people who will live at the property (including children).",
    ])
    add_field_row(story, "Additional Occupant 1 Name & Age:")
    add_field_row(story, "Additional Occupant 2 Name & Age:")
    story.append(Spacer(1, 0.3 * cm))
    
    # Section 7: Pets
    add_section(story, "7. PETS", [
        "Indicate if you have any pets.",
    ])
    add_field_row(story, "Do you have pets? (Yes/No):")
    add_field_row(story, "Pet Type & Breed:")
    add_field_row(story, "Pet Weight:")
    story.append(Spacer(1, 0.3 * cm))
    
    # Section 8: Vehicles
    add_section(story, "8. VEHICLES", [
        "Provide details of vehicles that will be parked at the property.",
    ])
    add_field_row(story, "Vehicle 1 Make/Model/Registration:")
    add_field_row(story, "Vehicle 2 Make/Model/Registration:")
    story.append(Spacer(1, 0.3 * cm))
    
    # Agent Use Only
    story.append(Spacer(1, 0.5 * cm))
    story.append(Paragraph("<b>FOR AGENT USE ONLY</b>", section_style))
    agent_data = [
        ["Application Received:", ""],
        ["Inspection Date:", ""],
        ["Income Verified:", ""],
        ["References Checked:", ""],
        ["Decision:", ""],
        ["Agent Notes:", ""],
    ]
    agent_table = Table(agent_data, colWidths=[4 * cm, PAGE_WIDTH - 2 * MARGIN - 4 * cm])
    agent_table.setStyle(field_box_style)
    story.append(agent_table)
    
    add_footer(story, "By signing this application, I confirm that all information provided is true and accurate. "
                    "I understand that false information may result in application rejection.")
    
    doc.build(story)
    print(f"Generated: {filepath}")


# ============================================================================
# 4. Tenancy Application VIC
# ============================================================================
def generate_tenancy_vic():
    """Generate VIC rental application form."""
    filepath = os.path.join(OUTPUT_DIR, "tenancy-application-vic.pdf")
    doc = SimpleDocTemplate(filepath, pagesize=A4)
    story = []

    add_header(story, "RENTAL APPLICATION FORM", "Victoria")
    
    # Section 1: Applicant Details
    add_section(story, "1. APPLICANT DETAILS", [
        "Provide details for all adults who will occupy the property.",
    ])
    add_field_row(story, "Full Name:")
    add_field_row(story, "Date of Birth:")
    add_field_row(story, "Phone Number:")
    add_field_row(story, "Email Address:")
    add_field_row(story, "Current Address:")
    add_field_row(story, "Length at Current Address:")
    story.append(Spacer(1, 0.3 * cm))
    
    # Section 2: Employment Details
    add_section(story, "2. EMPLOYMENT DETAILS", [
        "Provide current employment information.",
    ])
    add_field_row(story, "Employer Name:")
    add_field_row(story, "Job Title:")
    add_field_row(story, "Length of Employment:")
    add_field_row(story, "Gross Weekly Income ($):")
    story.append(Spacer(1, 0.3 * cm))
    
    # Section 3: Rental History
    add_section(story, "3. RENTAL HISTORY", [
        "Provide details of your previous rental accommodation.",
    ])
    add_field_row(story, "Previous Address:")
    add_field_row(story, "Landlord/Agent Name:")
    add_field_row(story, "Landlord/Agent Phone:")
    add_field_row(story, "Length of Tenancy:")
    add_field_row(story, "Reason for Leaving:")
    story.append(Spacer(1, 0.3 * cm))
    
    # Section 4: References
    add_section(story, "4. PERSONAL REFERENCES", [
        "Provide two personal references (not relatives).",
    ])
    add_field_row(story, "Reference 1 Name:")
    add_field_row(story, "Reference 1 Phone:")
    add_field_row(story, "Reference 1 Relationship:")
    story.append(Spacer(1, 0.2 * cm))
    add_field_row(story, "Reference 2 Name:")
    add_field_row(story, "Reference 2 Phone:")
    add_field_row(story, "Reference 2 Relationship:")
    story.append(Spacer(1, 0.3 * cm))
    
    # Section 5: Identification
    add_section(story, "5. IDENTIFICATION", [
        "Provide details of identification documents.",
    ])
    add_field_row(story, "Driver Licence Number:")
    add_field_row(story, "Passport Number (if applicable):")
    add_field_row(story, "Victorian Photo ID (if applicable):")
    story.append(Spacer(1, 0.3 * cm))
    
    # Section 6: Additional Occupants
    add_section(story, "6. ADDITIONAL OCCUPANTS", [
        "List any other people who will live at the property.",
    ])
    add_field_row(story, "Additional Occupant 1 Name & Age:")
    add_field_row(story, "Additional Occupant 2 Name & Age:")
    story.append(Spacer(1, 0.3 * cm))
    
    # Section 7: Pets
    add_section(story, "7. PETS", [
        "Indicate if you have any pets.",
    ])
    add_field_row(story, "Do you have pets? (Yes/No):")
    add_field_row(story, "Pet Type & Breed:")
    story.append(Spacer(1, 0.3 * cm))
    
    # Section 8: Vehicles
    add_section(story, "8. VEHICLES", [
        "Provide details of vehicles.",
    ])
    add_field_row(story, "Vehicle 1 Make/Model/Registration:")
    story.append(Spacer(1, 0.3 * cm))
    
    # Financial Details (VIC specific)
    story.append(Paragraph("<b>FINANCIAL DETAILS</b>", section_style))
    add_field_row(story, "Proposed Weekly Rent ($):")
    add_field_row(story, "Bond Amount ($):")
    add_field_row(story, "Proposed Move-in Date:")
    add_field_row(story, "Lease Term Preferred (6/12 months):")
    story.append(Spacer(1, 0.3 * cm))
    
    # Privacy Notice (VIC specific)
    story.append(Paragraph("<b>PRIVACY NOTICE</b>", section_style))
    story.append(Paragraph(
        "Victoria: Your personal information will be collected and used for the purpose of assessing "
        "your rental application. Information may be disclosed to credit reporting agencies and "
        "tenancy databases as permitted by law. You have the right to access your information "
        "under the Privacy and Data Protection Act 2014 (Vic).",
        small_style
    ))
    story.append(Spacer(1, 0.3 * cm))
    
    add_footer(story, "By signing this application, I confirm that all information provided is true and accurate. "
                    "I understand that false information may result in application rejection.")
    
    doc.build(story)
    print(f"Generated: {filepath}")


# ============================================================================
# 5. Superannuation Hardship Release
# ============================================================================
def generate_super_hardship():
    """Generate superannuation early release form."""
    filepath = os.path.join(OUTPUT_DIR, "superannuation-hardship.pdf")
    doc = SimpleDocTemplate(filepath, pagesize=A4)
    story = []

    add_header(story, "SUPERANNUATION EARLY RELEASE APPLICATION", "Compassionate Grounds - Financial Hardship")
    
    # Section A: Member Details
    add_section(story, "SECTION A - MEMBER DETAILS", [
        "Provide your superannuation member details.",
    ])
    add_field_row(story, "Full Name:")
    add_field_row(story, "Date of Birth:")
    add_field_row(story, "Superannuation Member Number:")
    add_field_row(story, "Fund Name:")
    add_field_row(story, "Phone Number:")
    add_field_row(story, "Email Address:")
    add_field_row(story, "Residential Address:")
    story.append(Spacer(1, 0.3 * cm))
    
    # Section B: Grounds for Release
    add_section(story, "SECTION B - GROUNDS FOR EARLY RELEASE", [
        "Specify the compassionate grounds for early release.",
    ])
    add_field_row(story, "Grounds for Release:")
    add_field_row(story, "Description of Financial Hardship:")
    add_field_row(story, "Duration of Financial Difficulty:")
    story.append(Spacer(1, 0.3 * cm))
    
    # Section C: Financial Details
    add_section(story, "SECTION C - FINANCIAL DETAILS", [
        "Provide details of your current financial situation.",
    ])
    add_field_row(story, "Current Savings ($):")
    add_field_row(story, "Monthly Income ($):")
    add_field_row(story, "Monthly Expenses ($):")
    add_field_row(story, "Outstanding Debts ($):")
    story.append(Spacer(1, 0.2 * cm))
    story.append(Paragraph("<b>Weekly Income Support Payments:</b>", body_style))
    add_field_row(story, "Centrelink Payment Type:")
    add_field_row(story, "Amount per Fortnight ($):")
    story.append(Spacer(1, 0.3 * cm))
    
    # Section D: Supporting Documents
    add_section(story, "SECTION D - SUPPORTING DOCUMENTS", [
        "List documents you are submitting with this application.",
    ])
    add_field_row(story, "Centrelink Income Statement:")
    add_field_row(story, "Bank Statements (last 3 months):")
    add_field_row(story, "Medical Certificate (if applicable):")
    add_field_row(story, "Other Documents:")
    story.append(Spacer(1, 0.3 * cm))
    
    # Section E: Amount Requested
    add_section(story, "SECTION E - AMOUNT REQUESTED", [
        "Specify the amount you are requesting to release.",
    ])
    add_field_row(story, "Amount Requested ($):")
    add_field_row(story, "Purpose of Funds:")
    add_field_row(story, "Bank Name:")
    add_field_row(story, "BSB:")
    add_field_row(story, "Account Number:")
    add_field_row(story, "Account Name:")
    
    add_footer(story, "I declare that the information provided is true and correct. "
                    "I understand that providing false information may result in penalties "
                    "and recovery of released amounts.")
    
    doc.build(story)
    print(f"Generated: {filepath}")


# ============================================================================
# Main
# ============================================================================
if __name__ == "__main__":
    print("Generating PDF templates for QuickFill...\n")
    
    generate_statutory_declaration()
    generate_centrelink_su415()
    generate_tenancy_nsw()
    generate_tenancy_vic()
    generate_super_hardship()
    
    print("\nAll templates generated successfully!")
    print(f"Output directory: {OUTPUT_DIR}")
