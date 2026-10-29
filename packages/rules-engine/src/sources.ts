export const SOURCES = {
  CASE_ORDER: {
    title: "Case-specific court order — human-confirmed reference and directions",
    url: null,
  },
  S1: {
    title: "BNSS 2023 Gazette",
    url: "https://www.mha.gov.in/files/documents/250884_2english_01042024.pdf",
  },
  S2: {
    title: "Legal Services Authorities Act",
    url: "https://cdnbbsr.s3waas.gov.in/s32e45f93088c7db59767efef516b306aa/uploads/2025/04/202504081796627129.pdf",
  },
  S3: {
    title: "NALSA Prison Legal Aid Clinics SOP 2022",
    url: "https://cdnbbsr.s3waas.gov.in/s32e45f93088c7db59767efef516b306aa/uploads/2025/04/20250408618042663.pdf",
  },
  S4: {
    title: "NALSA revised UTRC guidelines",
    url: "https://cdnbbsr.s3waas.gov.in/s32e45f93088c7db59767efef516b306aa/uploads/2025/04/20250514906784624.pdf",
  },
  S5: {
    title: "Satender Kumar Antil, 11 July 2022",
    url: "https://api.sci.gov.in/supremecourt/2021/27955/27955_2021_5_1505_36261_Judgement_11-Jul-2022.pdf",
  },
  S6: {
    title: "Supreme Court bail execution directions, 31 January 2023",
    url: "https://api.sci.gov.in/supremecourt/2021/26546/26546_2021_2_23_41396_Order_31-Jan-2023.pdf",
  },
  S7: {
    title: "MHA Section 479 advisory",
    url: "https://www.mha.gov.in/files/documents/Prisonreforms_06012025_2.pdf",
  },
  S8: {
    title: "Support to Poor Prisoners SOP, 2 December 2025",
    url: "https://www.mha.gov.in/files/documents/SOP_04122025.pdf",
  },
  S9: {
    title: "Suhas Chakma, 23 October 2024",
    url: "https://api.sci.gov.in/supremecourt/2020/19935/19935_2020_3_1501_56637_Judgement_23-Oct-2024.pdf",
  },
  S10: {
    title: "NDPS Act, Section 36A",
    url: "https://www.indiacode.nic.in/bitstream/123456789/6834/1/narcotic-drugs-and-psychotropic-substances-act-1985.pdf",
  },
  S11: {
    title: "Supreme Court UAPA extension judgment, 3 January 2024",
    url: "https://api.sci.gov.in/supremecourt/2021/6064/6064_2021_8_1505_49160_Judgement_03-Jan-2024.pdf",
  },
  S12: {
    title: "NALSA representation of persons in custody SOP",
    url: "https://cdnbbsr.s3waas.gov.in/s32e45f93088c7db59767efef516b306aa/uploads/2025/04/20250408976593997.pdf",
  },
  S13: {
    title: "NALSA early access to justice framework",
    url: "https://cdnbbsr.s3waas.gov.in/s32e45f93088c7db59767efef516b306aa/uploads/2025/04/20250408448855620.pdf",
  },
  S14: {
    title: "M. Ravindran judgment (NCB-hosted reproduction)",
    url: "https://narcoticsindia.nic.in/Judgments/M_Ravindran_vs_The_Intelligence_Officer_on_26_October_2020.pdf",
  },
  TEAM: { title: "JusticeGrid team policy — prototype operational target", url: null },
} as const;
export const ACTION_CATALOG = [
  ["A01", "Urgent referral", "S3"],
  ["A02", "Forward legal-aid request", "S3"],
  ["A03", "Appointment and intimation", "S3"],
  ["A04", "Effective representation and communication", "S9"],
  ["A05", "Investigation/default-bail timing review", "S1"],
  ["A06", "Prolonged-custody pathway review", "S7"],
  ["A07", "Bail grant and release follow-up", "S6"],
  ["A08", "Unfurnished bonds review", "S6"],
  ["A09", "Financial-support stage", "S8"],
  ["A10", "Hearing preparation", "S12"],
  ["A11", "Production and next hearing follow-up", "S12"],
  ["A12", "Obtain/review order and directions", "S12"],
  ["A13", "Pending bail application review", "S5"],
  ["A14", "Evidence-stage delay review", "S1"],
  ["A15", "UTRC recommendation and outcome", "S4"],
  ["A16", "Document/fact/ownership follow-up", "TEAM"],
  ["A17", "Status communication and legal-aid follow-up", "S3"],
] as const;
