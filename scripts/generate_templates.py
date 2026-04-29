#!/usr/bin/env python3
"""Generate professional Australian form templates using reportlab."""

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
import os

# Constants
PAGE_WIDTH, PAGE_HEIGHT = A4
MARGIN = 2.0 * cm
HEADER_HEIGHT = 1.2 * cm

styles = getSampleStyleSheet()

# Custom styles
title_style = ParagraphStyle(
    'Title',
    parent=styles['Heading1'],
    fontSize=18,
    textColor=colors.HexColor('#1a365d'),
    spaceAfter=12,
    alignment=TA_CENTER,
    fontName='Helvetica-Bold'
)

section_style = ParagraphStyle(
    'Section',
    parent=styles['Heading2'],
    fontSize=12,
    textColor=colors.HexColor('#2d3748'),
    spaceAfter=6,
    spaceBefore=12,
    fontName='Helvetica-Bold'
)

label_style = ParagraphStyle(
    'Label',
    parent=styles['Normal'],
    fontSize=9,
    textColor=colors.HexColor('#4a5568'),
    spaceAfter=2,
    fontName='Helvetica-Bold'
)

field_style = ParagraphStyle(
    'Field',
    parent=styles['Normal'],
    fontSize=9,
    textColor=colors.HexColor('#2d3748'),
    spaceAfter=6,
    leading=11
)

small_style = ParagraphStyle(
    'Small',
    parent=styles['Normal'],
    fontSize=7,
    textColor=colors.HexColor('#718096'),
    spaceAfter=3
)

body_style = ParagraphStyle(
    'Body',
    parent=styles['Normal'],
    fontSize=9,
    textColor=colors.HexColor('#2d3748'),
    spaceAfter=6,
    alignment=TA_JUSTIFY
)

def add_header(canvas, doc):
    """Add header to each page."""
    canvas.saveState()
    canvas.setFont('Helvetica-Bold', 8)
    canvas.setFillColor(colors.HexColor('#718096'))
    canvas.drawString(MARGIN, PAGE_HEIGHT - 0.5 * cm, "QuickFill - Australian Form Templates")
    canvas.restoreState()

def draw_line(canvas, x1, y, x2):
    """Draw a horizontal line."""
    canvas.setFillColor(colors.HexColor('#e2e8f0'))
    canvas.rect(x1, y - 0.1, x2 - x1, 0.2, fill=0, stroke=1)

def create_invoice_pdf(output_path):
    """Generate Australian Tax Invoice."""
    doc = SimpleDocTemplate(output_path, pagesize=A4,
                           leftMargin=MARGIN, rightMargin=MARGIN,
                           topMargin=HEADER_HEIGHT, bottomMargin=2*cm)
    elements = []

    # Title
    elements.append(Paragraph("TAX INVOICE", title_style))
    elements.append(Spacer(1, 0.5*cm))

    # Business details (right aligned)
    business_data = [
        ["<b>YOUR BUSINESS NAME</b>"],
        ["ABN: 12 345 678 901"],
        ["123 Business Street"],
        ["Sydney NSW 2000"],
        ["Phone: (02) 9876 5432"],
        ["Email: info@yourbusiness.com.au"]
    ]
    business_table = Table(business_data, colWidths=[8*cm])
    business_table.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'RIGHT'),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
    ]))
    elements.append(business_table)
    elements.append(Spacer(1, 0.5*cm))

    # Invoice details
    elements.append(Paragraph("<b>Invoice Details</b>", section_style))
    invoice_data = [
        ["Invoice Number:", "INV-2026-001"],
        ["Invoice Date:", "12 April 2026"],
        ["Due Date:", "12 May 2026"],
    ]
    invoice_table = Table(invoice_data, colWidths=[4*cm, 5*cm])
    invoice_table.setStyle(TableStyle([
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('ALIGN', (1, 0), (1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LINEBELOW', (0, -1), (-1, -1), 1, colors.HexColor('#e2e8f0')),
    ]))
    elements.append(invoice_table)
    elements.append(Spacer(1, 0.5*cm))

    # Bill To section
    elements.append(Paragraph("<b>Bill To</b>", section_style))
    bill_data = [
        ["<b>Client Name</b>"],
        ["123 Client Street"],
        ["Melbourne VIC 3000"],
        ["Email: client@example.com"],
        ["Phone: (03) 1234 5678"]
    ]
    bill_table = Table(bill_data, colWidths=[9*cm])
    bill_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
    ]))
    elements.append(bill_table)
    elements.append(Spacer(1, 0.5*cm))

    # Line items table
    elements.append(Paragraph("<b>Line Items</b>", section_style))
    line_data = [
        ["<b>Description</b>", "<b>Qty</b>", "<b>Unit Price</b>", "<b>Amount</b>"],
        ["Professional Services - Consulting", "10", "$150.00", "$1,500.00"],
        ["Software Development", "20", "$120.00", "$2,400.00"],
        ["Project Management", "5", "$100.00", "$500.00"],
    ]
    line_table = Table(line_data, colWidths=[8*cm, 1.5*cm, 2.5*cm, 2.5*cm])
    line_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f7fafc')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#2d3748')),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('LINEBELOW', (0, 0), (-1, 0), 2, colors.HexColor('#2d3748')),
        ('LINEBELOW', (0, -1), (-1, -1), 1, colors.HexColor('#e2e8f0')),
    ]))
    elements.append(line_table)
    elements.append(Spacer(1, 0.3*cm))

    # Totals
    totals_data = [
        ["Subtotal:", "$4,400.00"],
        ["GST (10%):", "$440.00"],
        ["<b>Total Amount Due:</b>", "<b>$4,840.00</b>"],
    ]
    totals_table = Table(totals_data, colWidths=[6*cm, 3*cm])
    totals_table.setStyle(TableStyle([
        ('ALIGN', (0, 0), (0, -1), 'RIGHT'),
        ('FONTNAME', (0, 0), (-1, -2), 'Helvetica'),
        ('FONTNAME', (1, 0), (1, -2), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LINEABOVE', (0, -2), (-1, -2), 1, colors.HexColor('#e2e8f0')),
        ('LINEABOVE', (0, -1), (-1, -1), 2, colors.HexColor('#2d3748')),
    ]))
    elements.append(totals_table)
    elements.append(Spacer(1, 0.5*cm))

    # Payment details
    elements.append(Paragraph("<b>Payment Details</b>", section_style))
    payment_data = [
        ["Bank: Commonwealth Bank"],
        ["BSB: 062-000"],
        ["Account Number: 12345678"],
        ["Account Name: Your Business Name"],
        ["Reference: INV-2026-001"]
    ]
    payment_table = Table(payment_data, colWidths=[8*cm])
    payment_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
    ]))
    elements.append(payment_table)
    elements.append(Spacer(1, 0.5*cm))

    # Footer note
    elements.append(Paragraph(
        "GST registered business - ABN must be quoted on all tax invoices",
        small_style
    ))

    doc.build(elements, onFirstPage=add_header, onLaterPages=add_header)
    print(f"Created: {output_path}")

def create_rental_application_pdf(output_path):
    """Generate Residential Rental Application."""
    doc = SimpleDocTemplate(output_path, pagesize=A4,
                           leftMargin=MARGIN, rightMargin=MARGIN,
                           topMargin=HEADER_HEIGHT, bottomMargin=2*cm)
    elements = []

    # Title
    elements.append(Paragraph("RESIDENTIAL RENTAL APPLICATION", title_style))
    elements.append(Spacer(1, 0.3*cm))
    elements.append(Paragraph("Please complete all sections in full", small_style))
    elements.append(Spacer(1, 0.5*cm))

    # Property Address
    elements.append(Paragraph("<b>Property Address</b>", section_style))
    elements.append(Paragraph("Address you wish to rent:", label_style))
    elements.append(Spacer(1, 0.3*cm))
    elements.append(Paragraph("_" * 60, field_style))
    elements.append(Spacer(1, 0.3*cm))

    # Personal Details
    elements.append(Paragraph("<b>Personal Details</b>", section_style))
    personal_data = [
        ["Full Name:", "_" * 40],
        ["Date of Birth:", "_" * 15],
        ["Phone:", "_" * 20],
        ["Email:", "_" * 35],
        ["Current Address:", "_" * 45],
        ["How long at current address:", "_" * 20],
    ]
    personal_table = Table(personal_data, colWidths=[4*cm, 11*cm])
    personal_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(personal_table)
    elements.append(Spacer(1, 0.3*cm))

    # Employment
    elements.append(Paragraph("<b>Employment Details</b>", section_style))
    emp_data = [
        ["Employer:", "_" * 40],
        ["Position/Job Title:", "_" * 35],
        ["Gross Income (per week/year):", "_" * 30],
        ["Payslip provided:", "☐ Yes   ☐ No"],
    ]
    emp_table = Table(emp_data, colWidths=[4*cm, 11*cm])
    emp_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(emp_table)
    elements.append(Spacer(1, 0.3*cm))

    # References
    elements.append(Paragraph("<b>References (2 required)</b>", section_style))
    ref1_data = [
        ["Reference 1"],
        ["Name:", "_" * 30],
        ["Phone:", "_" * 25],
        ["Relationship:", "_" * 30],
    ]
    ref1_table = Table(ref1_data, colWidths=[15*cm])
    ref1_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, 0), 'Helvetica-Bold'),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    elements.append(ref1_table)
    elements.append(Spacer(1, 0.2*cm))

    ref2_data = [
        ["Reference 2"],
        ["Name:", "_" * 30],
        ["Phone:", "_" * 25],
        ["Relationship:", "_" * 30],
    ]
    ref2_table = Table(ref2_data, colWidths=[15*cm])
    ref2_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, 0), 'Helvetica-Bold'),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    elements.append(ref2_table)
    elements.append(Spacer(1, 0.3*cm))

    # Emergency Contact
    elements.append(Paragraph("<b>Emergency Contact</b>", section_style))
    emergency_data = [
        ["Name:", "_" * 30],
        ["Phone:", "_" * 25],
        ["Relationship:", "_" * 30],
    ]
    emergency_table = Table(emergency_data, colWidths=[4*cm, 11*cm])
    emergency_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    elements.append(emergency_table)
    elements.append(Spacer(1, 0.3*cm))

    # Identification
    elements.append(Paragraph("<b>Identification</b>", section_style))
    id_data = [
        ["Driver's Licence Number:", "_" * 35],
        ["State Issued:", "_" * 20],
        ["Passport Number (if applicable):", "_" * 35],
    ]
    id_table = Table(id_data, colWidths=[4*cm, 11*cm])
    id_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    elements.append(id_table)
    elements.append(Spacer(1, 0.5*cm))

    # Signature
    elements.append(Paragraph("<b>Declaration</b>", section_style))
    elements.append(Paragraph(
        "I declare that the information provided in this application is true and correct. "
        "I authorise any references listed to provide information regarding my rental history.",
        body_style
    ))
    elements.append(Spacer(1, 0.3*cm))
    elements.append(Paragraph("Applicant Signature:", label_style))
    elements.append(Paragraph("_" * 40, field_style))
    elements.append(Spacer(1, 0.2*cm))
    elements.append(Paragraph("Date:", label_style))
    elements.append(Paragraph("_" * 20, field_style))

    doc.build(elements, onFirstPage=add_header, onLaterPages=add_header)
    print(f"Created: {output_path}")

def create_employee_details_pdf(output_path):
    """Generate New Employee Details Form."""
    doc = SimpleDocTemplate(output_path, pagesize=A4,
                           leftMargin=MARGIN, rightMargin=MARGIN,
                           topMargin=HEADER_HEIGHT, bottomMargin=2*cm)
    elements = []

    # Title
    elements.append(Paragraph("NEW EMPLOYEE DETAILS FORM", title_style))
    elements.append(Spacer(1, 0.3*cm))
    elements.append(Paragraph("Complete this form for payroll and HR records", small_style))
    elements.append(Spacer(1, 0.5*cm))

    # Personal Information
    elements.append(Paragraph("<b>Personal Information</b>", section_style))
    personal_data = [
        ["Full Legal Name:", "_" * 40],
        ["Date of Birth:", "_" * 15],
        ["Residential Address:", "_" * 45],
        ["Phone:", "_" * 20],
        ["Email:", "_" * 35],
    ]
    personal_table = Table(personal_data, colWidths=[4*cm, 11*cm])
    personal_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    elements.append(personal_table)
    elements.append(Spacer(1, 0.3*cm))

    # Tax Information
    elements.append(Paragraph("<b>Tax Information</b>", section_style))
    tax_data = [
        ["Tax File Number (TFN):", "_" * 35],
        ["Exemption reason (if no TFN):", "_" * 35],
        ["Claim tax-free threshold:", "☐ Yes   ☐ No"],
        ["HELP/HECS debt:", "☐ Yes   ☐ No"],
    ]
    tax_table = Table(tax_data, colWidths=[4*cm, 11*cm])
    tax_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    elements.append(tax_table)
    elements.append(Spacer(1, 0.3*cm))

    # Banking Details
    elements.append(Paragraph("<b>Banking Details (for salary payment)</b>", section_style))
    bank_data = [
        ["BSB:", "_" * 15],
        ["Account Number:", "_" * 25],
        ["Account Name:", "_" * 35],
    ]
    bank_table = Table(bank_data, colWidths=[4*cm, 11*cm])
    bank_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    elements.append(bank_table)
    elements.append(Spacer(1, 0.3*cm))

    # Superannuation
    elements.append(Paragraph("<b>Superannuation</b>", section_style))
    super_data = [
        ["Super Fund Name:", "_" * 35],
        ["USI (Unique Super Identifier):", "_" * 35],
        ["Member Number:", "_" * 30],
        ["☐ Use Employer default fund"],
    ]
    super_table = Table(super_data, colWidths=[4*cm, 11*cm])
    super_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    elements.append(super_table)
    elements.append(Spacer(1, 0.3*cm))

    # Emergency Contact
    elements.append(Paragraph("<b>Emergency Contact</b>", section_style))
    emergency_data = [
        ["Name:", "_" * 35],
        ["Phone:", "_" * 25],
        ["Relationship:", "_" * 30],
    ]
    emergency_table = Table(emergency_data, colWidths=[4*cm, 11*cm])
    emergency_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    elements.append(emergency_table)
    elements.append(Spacer(1, 0.5*cm))

    # Declaration
    elements.append(Paragraph("<b>Declaration</b>", section_style))
    elements.append(Paragraph(
        "I certify that the information provided above is accurate and complete. "
        "I understand that any false information may result in termination of employment.",
        body_style
    ))
    elements.append(Spacer(1, 0.5*cm))
    elements.append(Paragraph("Employee Signature:", label_style))
    elements.append(Paragraph("_" * 40, field_style))
    elements.append(Spacer(1, 0.2*cm))
    elements.append(Paragraph("Date:", label_style))
    elements.append(Paragraph("_" * 20, field_style))

    doc.build(elements, onFirstPage=add_header, onLaterPages=add_header)
    print(f"Created: {output_path}")

def create_consent_form_pdf(output_path):
    """Generate General Consent and Authority Form."""
    doc = SimpleDocTemplate(output_path, pagesize=A4,
                           leftMargin=MARGIN, rightMargin=MARGIN,
                           topMargin=HEADER_HEIGHT, bottomMargin=2*cm)
    elements = []

    # Title
    elements.append(Paragraph("GENERAL CONSENT AND AUTHORITY FORM", title_style))
    elements.append(Spacer(1, 0.5*cm))

    # Personal Details
    elements.append(Paragraph("<b>Your Details</b>", section_style))
    personal_data = [
        ["Full Name:", "_" * 40],
        ["Date of Birth:", "_" * 15],
        ["Residential Address:", "_" * 45],
    ]
    personal_table = Table(personal_data, colWidths=[4*cm, 11*cm])
    personal_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    elements.append(personal_table)
    elements.append(Spacer(1, 0.3*cm))

    # Purpose of Consent
    elements.append(Paragraph("<b>Purpose of Consent</b>", section_style))
    elements.append(Paragraph("Please describe what you are consenting to:", label_style))
    elements.append(Spacer(1, 0.2*cm))
    elements.append(Paragraph("⬜" * 80, field_style))
    elements.append(Paragraph("⬜" * 80, field_style))
    elements.append(Paragraph("⬜" * 80, field_style))
    elements.append(Spacer(1, 0.3*cm))

    # Authorised Person/Organisation
    elements.append(Paragraph("<b>Authorised Person or Organisation</b>", section_style))
    elements.append(Paragraph("Name of person/organisation you are authorising:", label_style))
    elements.append(Paragraph("_" * 60, field_style))
    elements.append(Spacer(1, 0.3*cm))

    # Duration of Consent
    elements.append(Paragraph("<b>Duration of Consent</b>", section_style))
    duration_data = [
        ["Start Date:", "_" * 20],
        ["End Date (or \"until further notice\"):", "_" * 30],
    ]
    duration_table = Table(duration_data, colWidths=[4*cm, 11*cm])
    duration_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    elements.append(duration_table)
    elements.append(Spacer(1, 0.3*cm))

    # Understanding section
    elements.append(Paragraph("<b>I understand and agree that:</b>", section_style))
    bullets = [
        "• The information I have provided is accurate and complete",
        "• The authorised person/organisation may use this information for the stated purpose",
        "• I may withdraw this consent at any time by providing written notice",
        "• I am responsible for ensuring the information remains current and accurate",
    ]
    for bullet in bullets:
        elements.append(Paragraph(bullet, body_style))
    elements.append(Spacer(1, 0.5*cm))

    # Signatures
    elements.append(Paragraph("<b>Signatures</b>", section_style))
    elements.append(Paragraph("Applicant Signature:", label_style))
    elements.append(Paragraph("_" * 40, field_style))
    elements.append(Spacer(1, 0.2*cm))
    elements.append(Paragraph("Print Name:", label_style))
    elements.append(Paragraph("_" * 30, field_style))
    elements.append(Spacer(1, 0.2*cm))
    elements.append(Paragraph("Date:", label_style))
    elements.append(Paragraph("_" * 20, field_style))
    elements.append(Spacer(1, 0.5*cm))
    elements.append(Paragraph("Witness Signature:", label_style))
    elements.append(Paragraph("_" * 40, field_style))
    elements.append(Spacer(1, 0.2*cm))
    elements.append(Paragraph("Witness Name (print):", label_style))
    elements.append(Paragraph("_" * 35, field_style))

    doc.build(elements, onFirstPage=add_header, onLaterPages=add_header)
    print(f"Created: {output_path}")

def create_medical_consent_pdf(output_path):
    """Generate Patient Consent Form."""
    doc = SimpleDocTemplate(output_path, pagesize=A4,
                           leftMargin=MARGIN, rightMargin=MARGIN,
                           topMargin=HEADER_HEIGHT, bottomMargin=2*cm)
    elements = []

    # Title
    elements.append(Paragraph("PATIENT CONSENT FORM", title_style))
    elements.append(Spacer(1, 0.5*cm))

    # Patient Details
    elements.append(Paragraph("<b>Patient Details</b>", section_style))
    patient_data = [
        ["Full Name:", "_" * 40],
        ["Date of Birth:", "_" * 15],
        ["Medicare Number:", "_" * 25],
        ["Residential Address:", "_" * 45],
        ["Phone:", "_" * 20],
    ]
    patient_table = Table(patient_data, colWidths=[4*cm, 11*cm])
    patient_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    elements.append(patient_table)
    elements.append(Spacer(1, 0.3*cm))

    # Medical Practitioner
    elements.append(Paragraph("<b>Medical Practitioner</b>", section_style))
    gp_data = [
        ["GP / Referring Doctor:", "_" * 40],
        ["Medical Practice/Clinic:", "_" * 40],
    ]
    gp_table = Table(gp_data, colWidths=[4*cm, 11*cm])
    gp_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    elements.append(gp_table)
    elements.append(Spacer(1, 0.3*cm))

    # Procedure/Treatment
    elements.append(Paragraph("<b>Procedure / Treatment</b>", section_style))
    elements.append(Paragraph("Description of procedure or treatment:", label_style))
    elements.append(Paragraph("⬜" * 80, field_style))
    elements.append(Paragraph("⬜" * 80, field_style))
    elements.append(Paragraph("⬜" * 80, field_style))
    elements.append(Spacer(1, 0.3*cm))

    # Allergies
    elements.append(Paragraph("<b>Allergies / Adverse Reactions</b>", section_style))
    elements.append(Paragraph("List any known allergies or adverse reactions:", label_style))
    elements.append(Paragraph("_" * 60, field_style))
    elements.append(Paragraph("☐ No known allergies", body_style))
    elements.append(Spacer(1, 0.3*cm))

    # Risk Acknowledgement
    elements.append(Paragraph("<b>Risk Acknowledgement</b>", section_style))
    risks = [
        "☐ I have been informed of the nature and purpose of this procedure/treatment",
        "☐ I have been informed of the potential risks and benefits",
        "☐ I have had the opportunity to ask questions and all have been answered to my satisfaction",
        "☐ I understand that no guarantee has been given as to the outcome",
        "☐ I consent to the use of anaesthesia as deemed necessary by the medical practitioner",
    ]
    for risk in risks:
        elements.append(Paragraph(risk, body_style))
    elements.append(Spacer(1, 0.5*cm))

    # Emergency Contact
    elements.append(Paragraph("<b>Emergency Contact</b>", section_style))
    emergency_data = [
        ["Name:", "_" * 35],
        ["Phone:", "_" * 25],
        ["Relationship:", "_" * 30],
    ]
    emergency_table = Table(emergency_data, colWidths=[4*cm, 11*cm])
    emergency_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    elements.append(emergency_table)
    elements.append(Spacer(1, 0.5*cm))

    # Signatures
    elements.append(Paragraph("<b>Signatures</b>", section_style))
    elements.append(Paragraph("Patient Signature:", label_style))
    elements.append(Paragraph("_" * 40, field_style))
    elements.append(Spacer(1, 0.2*cm))
    elements.append(Paragraph("Date:", label_style))
    elements.append(Paragraph("_" * 20, field_style))
    elements.append(Spacer(1, 0.5*cm))
    elements.append(Paragraph("Witness Signature:", label_style))
    elements.append(Paragraph("_" * 40, field_style))
    elements.append(Spacer(1, 0.2*cm))
    elements.append(Paragraph("Date:", label_style))
    elements.append(Paragraph("_" * 20, field_style))

    doc.build(elements, onFirstPage=add_header, onLaterPages=add_header)
    print(f"Created: {output_path}")

def create_bank_account_change_pdf(output_path):
    """Generate Bank Account Update Request."""
    doc = SimpleDocTemplate(output_path, pagesize=A4,
                           leftMargin=MARGIN, rightMargin=MARGIN,
                           topMargin=HEADER_HEIGHT, bottomMargin=2*cm)
    elements = []

    # Title
    elements.append(Paragraph("BANK ACCOUNT UPDATE REQUEST", title_style))
    elements.append(Spacer(1, 0.5*cm))

    # Personal Details
    elements.append(Paragraph("<b>Your Details</b>", section_style))
    personal_data = [
        ["Full Name:", "_" * 40],
        ["Date of Birth:", "_" * 15],
        ["Residential Address:", "_" * 45],
    ]
    personal_table = Table(personal_data, colWidths=[4*cm, 11*cm])
    personal_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    elements.append(personal_table)
    elements.append(Spacer(1, 0.3*cm))

    # Organisation
    elements.append(Paragraph("<b>Organisation Details</b>", section_style))
    org_data = [
        ["Organisation Name (employer/super fund/agency):", "_" * 45],
        ["Organisation Reference/Employee ID:", "_" * 35],
    ]
    org_table = Table(org_data, colWidths=[4*cm, 11*cm])
    org_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    elements.append(org_table)
    elements.append(Spacer(1, 0.3*cm))

    # Existing Account
    elements.append(Paragraph("<b>Existing Bank Account</b>", section_style))
    existing_data = [
        ["BSB:", "_" * 15],
        ["Account Number:", "_" * 25],
        ["Account Name:", "_" * 35],
    ]
    existing_table = Table(existing_data, colWidths=[4*cm, 11*cm])
    existing_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    elements.append(existing_table)
    elements.append(Spacer(1, 0.3*cm))

    # New Account
    elements.append(Paragraph("<b>New Bank Account Details</b>", section_style))
    new_data = [
        ["Bank Name:", "_" * 35],
        ["Branch Name (if applicable):", "_" * 35],
        ["BSB:", "_" * 15],
        ["Account Number:", "_" * 25],
        ["Account Name:", "_" * 35],
    ]
    new_table = Table(new_data, colWidths=[4*cm, 11*cm])
    new_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    elements.append(new_table)
    elements.append(Spacer(1, 0.3*cm))

    # Effective Date
    elements.append(Paragraph("<b>Effective Date</b>", section_style))
    elements.append(Paragraph("From which date should payments be made to the new account?", label_style))
    elements.append(Paragraph("_" * 25, field_style))
    elements.append(Spacer(1, 0.3*cm))

    # Declaration
    elements.append(Paragraph("<b>Declaration</b>", section_style))
    elements.append(Paragraph(
        "I certify that the above details are correct and that I am the authorised account holder. "
        "I understand that the organisation is not liable for any payments made in accordance with this request.",
        body_style
    ))
    elements.append(Spacer(1, 0.5*cm))
    elements.append(Paragraph("Signature:", label_style))
    elements.append(Paragraph("_" * 40, field_style))
    elements.append(Spacer(1, 0.2*cm))
    elements.append(Paragraph("Date:", label_style))
    elements.append(Paragraph("_" * 20, field_style))
    elements.append(Spacer(1, 0.2*cm))
    elements.append(Paragraph("Phone for verification:", label_style))
    elements.append(Paragraph("_" * 25, field_style))

    doc.build(elements, onFirstPage=add_header, onLaterPages=add_header)
    print(f"Created: {output_path}")

def create_insurance_claim_pdf(output_path):
    """Generate Insurance Claim Form."""
    doc = SimpleDocTemplate(output_path, pagesize=A4,
                           leftMargin=MARGIN, rightMargin=MARGIN,
                           topMargin=HEADER_HEIGHT, bottomMargin=2*cm)
    elements = []

    # Title
    elements.append(Paragraph("INSURANCE CLAIM FORM", title_style))
    elements.append(Spacer(1, 0.5*cm))

    # Policy Holder Details
    elements.append(Paragraph("<b>Policy Holder Details</b>", section_style))
    policy_data = [
        ["Full Name:", "_" * 40],
        ["Policy Number:", "_" * 25],
        ["Date of Birth:", "_" * 15],
        ["Phone:", "_" * 20],
        ["Email:", "_" * 35],
        ["Address:", "_" * 45],
    ]
    policy_table = Table(policy_data, colWidths=[4*cm, 11*cm])
    policy_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    elements.append(policy_table)
    elements.append(Spacer(1, 0.3*cm))

    # Incident Details
    elements.append(Paragraph("<b>Incident Details</b>", section_style))
    incident_data = [
        ["Date of Incident:", "_" * 25],
        ["Time of Incident:", "_" * 20],
        ["Location of Incident:", "_" * 40],
    ]
    incident_table = Table(incident_data, colWidths=[4*cm, 11*cm])
    incident_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    elements.append(incident_table)
    elements.append(Spacer(1, 0.2*cm))
    elements.append(Paragraph("Description of Incident:", label_style))
    elements.append(Paragraph("⬜" * 80, field_style))
    elements.append(Paragraph("⬜" * 80, field_style))
    elements.append(Paragraph("⬜" * 80, field_style))
    elements.append(Paragraph("⬜" * 80, field_style))
    elements.append(Spacer(1, 0.3*cm))

    # Type of Claim
    elements.append(Paragraph("<b>Type of Claim</b>", section_style))
    claim_types = [
        "☐ Home Building   ☐ Contents   ☐ Motor Vehicle   ☐ Personal Property   ☐ Other:",
    ]
    for ct in claim_types:
        elements.append(Paragraph(ct, body_style))
    elements.append(Spacer(1, 0.3*cm))

    # Damage/Loss Description
    elements.append(Paragraph("<b>Damage / Loss Details</b>", section_style))
    elements.append(Paragraph("Description of damaged/lost items:", label_style))
    elements.append(Paragraph("⬜" * 80, field_style))
    elements.append(Paragraph("⬜" * 80, field_style))
    elements.append(Paragraph("⬜" * 80, field_style))
    elements.append(Spacer(1, 0.2*cm))
    elements.append(Paragraph("Estimated Total Value: $", label_style))
    elements.append(Paragraph("_" * 20, field_style))
    elements.append(Spacer(1, 0.3*cm))

    # Police Report
    elements.append(Paragraph("<b>Police Report</b>", section_style))
    police_data = [
        ["Was a police report filed?", "☐ Yes   ☐ No"],
        ["Police Report Number (if applicable):", "_" * 35],
        ["Police Station:", "_" * 35],
    ]
    police_table = Table(police_data, colWidths=[5*cm, 10*cm])
    police_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    elements.append(police_table)
    elements.append(Spacer(1, 0.3*cm))

    # Supporting Documents
    elements.append(Paragraph("<b>Supporting Documents Provided</b>", section_style))
    docs = [
        "☐ Photographs of damage   ☐ Police report   ☐ Receipts/invoices",
        "☐ Repair quotes   ☐ Other:",
    ]
    for d in docs:
        elements.append(Paragraph(d, body_style))
    elements.append(Spacer(1, 0.5*cm))

    # Declaration
    elements.append(Paragraph("<b>Declaration</b>", section_style))
    elements.append(Paragraph(
        "I declare that the information provided in this claim is true and accurate. "
        "I understand that providing false or misleading information may result in my claim being denied "
        "and may constitute insurance fraud.",
        body_style
    ))
    elements.append(Spacer(1, 0.5*cm))
    elements.append(Paragraph("Signature:", label_style))
    elements.append(Paragraph("_" * 40, field_style))
    elements.append(Spacer(1, 0.2*cm))
    elements.append(Paragraph("Date:", label_style))
    elements.append(Paragraph("_" * 20, field_style))

    doc.build(elements, onFirstPage=add_header, onLaterPages=add_header)
    print(f"Created: {output_path}")

def create_ndis_service_agreement_pdf(output_path):
    """Generate NDIS Service Agreement."""
    doc = SimpleDocTemplate(output_path, pagesize=A4,
                           leftMargin=MARGIN, rightMargin=MARGIN,
                           topMargin=HEADER_HEIGHT, bottomMargin=2*cm)
    elements = []

    # Title
    elements.append(Paragraph("NDIS SERVICE AGREEMENT", title_style))
    elements.append(Spacer(1, 0.3*cm))
    elements.append(Paragraph("This agreement is consistent with the NDIS Code of Conduct", small_style))
    elements.append(Spacer(1, 0.5*cm))

    # Participant Details
    elements.append(Paragraph("<b>Participant Details</b>", section_style))
    participant_data = [
        ["Full Name:", "_" * 40],
        ["NDIS Number:", "_" * 25],
        ["Date of Birth:", "_" * 15],
        ["Address:", "_" * 45],
        ["Phone:", "_" * 20],
    ]
    participant_table = Table(participant_data, colWidths=[4*cm, 11*cm])
    participant_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    elements.append(participant_table)
    elements.append(Spacer(1, 0.3*cm))

    # Support Coordinator
    elements.append(Paragraph("<b>Support Coordinator (if applicable)</b>", section_style))
    coord_data = [
        ["Name:", "_" * 40],
        ["Organisation:", "_" * 40],
        ["Phone:", "_" * 25],
        ["Email:", "_" * 35],
    ]
    coord_table = Table(coord_data, colWidths=[4*cm, 11*cm])
    coord_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    elements.append(coord_table)
    elements.append(Spacer(1, 0.3*cm))

    # Provider Details
    elements.append(Paragraph("<b>Provider Details</b>", section_style))
    provider_data = [
        ["Organisation Name:", "_" * 45],
        ["ABN:", "_" * 25],
        ["Contact Person:", "_" * 35],
        ["Phone:", "_" * 20],
        ["Email:", "_" * 35],
    ]
    provider_table = Table(provider_data, colWidths=[4*cm, 11*cm])
    provider_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    elements.append(provider_table)
    elements.append(Spacer(1, 0.3*cm))

    # Agreement Period
    elements.append(Paragraph("<b>Agreement Period</b>", section_style))
    period_data = [
        ["Start Date:", "_" * 20],
        ["End Date:", "_" * 20],
    ]
    period_table = Table(period_data, colWidths=[4*cm, 11*cm])
    period_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    elements.append(period_table)
    elements.append(Spacer(1, 0.3*cm))

    # Support Details Table
    elements.append(Paragraph("<b>Support Details</b>", section_style))
    support_data = [
        ["<b>Support Type</b>", "<b>Support Category</b>", "<b>Hours/Units</b>", "<b>Rate ($)</b>", "<b>Total ($)</b>"],
        ["Personal Care", "Core Supports", "10 hours/week", "55.00", "550.00"],
        ["Community Access", "Core Supports", "4 hours/week", "50.00", "200.00"],
        ["Therapy Services", "Capacity Building", "1 hour/week", "180.00", "180.00"],
    ]
    support_table = Table(support_data, colWidths=[5*cm, 4*cm, 2.5*cm, 2.5*cm, 2.5*cm])
    support_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f7fafc')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#2d3748')),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('ALIGN', (2, 0), (-1, -1), 'RIGHT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('LINEBELOW', (0, 0), (-1, 0), 2, colors.HexColor('#2d3748')),
        ('LINEBELOW', (0, -1), (-1, -1), 1, colors.HexColor('#e2e8f0')),
    ]))
    elements.append(support_table)
    elements.append(Spacer(1, 0.3*cm))

    # Goals Section
    elements.append(Paragraph("<b>Goals and Outcomes</b>", section_style))
    elements.append(Paragraph("Describe the participant's goals and desired outcomes:", label_style))
    elements.append(Paragraph("⬜" * 80, field_style))
    elements.append(Paragraph("⬜" * 80, field_style))
    elements.append(Paragraph("⬜" * 80, field_style))
    elements.append(Paragraph("⬜" * 80, field_style))
    elements.append(Spacer(1, 0.3*cm))

    # Cancellation Policy
    elements.append(Paragraph("<b>Cancellation Policy</b>", section_style))
    elements.append(Paragraph(
        "Support sessions may be cancelled with at least 2 business days' notice. "
        "Cancellations made with less than 2 business days' notice may be subject to a cancellation fee "
        "as outlined in the NDIS Price Guide.",
        body_style
    ))
    elements.append(Spacer(1, 0.3*cm))

    # Complaints/Feedback
    elements.append(Paragraph("<b>Complaints and Feedback</b>", section_style))
    elements.append(Paragraph(
        "If you have any concerns or complaints about the services provided, please contact the provider "
        "directly. If you are not satisfied with the response, you may contact the NDIS Quality and Safeguards Commission.",
        body_style
    ))
    elements.append(Spacer(1, 0.5*cm))

    # Signatures
    elements.append(Paragraph("<b>Signatures</b>", section_style))
    elements.append(Paragraph("Participant Signature:", label_style))
    elements.append(Paragraph("_" * 40, field_style))
    elements.append(Spacer(1, 0.2*cm))
    elements.append(Paragraph("Date:", label_style))
    elements.append(Paragraph("_" * 20, field_style))
    elements.append(Spacer(1, 0.5*cm))
    elements.append(Paragraph("Provider Representative Signature:", label_style))
    elements.append(Paragraph("_" * 40, field_style))
    elements.append(Spacer(1, 0.2*cm))
    elements.append(Paragraph("Print Name:", label_style))
    elements.append(Paragraph("_" * 35, field_style))
    elements.append(Spacer(1, 0.2*cm))
    elements.append(Paragraph("Date:", label_style))
    elements.append(Paragraph("_" * 20, field_style))

    doc.build(elements, onFirstPage=add_header, onLaterPages=add_header)
    print(f"Created: {output_path}")

def main():
    """Generate all PDF templates."""
    output_dir = "/home/kyle/projects/quickfill/public/templates"

    templates = [
        ("australian-invoice.pdf", create_invoice_pdf),
        ("rental-application.pdf", create_rental_application_pdf),
        ("employee-details.pdf", create_employee_details_pdf),
        ("consent-form.pdf", create_consent_form_pdf),
        ("medical-consent.pdf", create_medical_consent_pdf),
        ("bank-account-change.pdf", create_bank_account_change_pdf),
        ("insurance-claim.pdf", create_insurance_claim_pdf),
        ("ndis-service-agreement.pdf", create_ndis_service_agreement_pdf),
    ]

    for filename, generator in templates:
        output_path = os.path.join(output_dir, filename)
        generator(output_path)

    print("\n✓ All templates generated successfully!")

if __name__ == "__main__":
    main()
