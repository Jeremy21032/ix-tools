/**
 * Catálogo UI espejo del server (documentGenerator).
 * Si el meta API responde, se puede sobrescribir; esto asegura que el flujo
 * país → tipo funcione aunque el meta tarde.
 */
export const FAKE_DOCUMENTS = [
  { id: "CL_RUT", country: "CL", countryName: "Chile", type: "RUT" },
  { id: "CO_CEDULA", country: "CO", countryName: "Colombia", type: "Cédula" },
  { id: "CO_NIT", country: "CO", countryName: "Colombia", type: "NIT" },
  { id: "PE_DNI", country: "PE", countryName: "Perú", type: "DNI" },
  { id: "PE_RUC_NAT", country: "PE", countryName: "Perú", type: "RUC (natural)" },
  { id: "PE_RUC_JUR", country: "PE", countryName: "Perú", type: "RUC (jurídica)" },
  { id: "EC_CEDULA", country: "EC", countryName: "Ecuador", type: "Cédula" },
  { id: "EC_RUC", country: "EC", countryName: "Ecuador", type: "RUC" },
  { id: "MX_RFC_PF", country: "MX", countryName: "México", type: "RFC persona física" },
  { id: "MX_RFC_PM", country: "MX", countryName: "México", type: "RFC persona moral" },
  { id: "MX_CURP", country: "MX", countryName: "México", type: "CURP" },
  { id: "GT_NIT", country: "GT", countryName: "Guatemala", type: "NIT" },
  { id: "GT_DPI", country: "GT", countryName: "Guatemala", type: "DPI / CUI" },
  { id: "AR_DNI", country: "AR", countryName: "Argentina", type: "DNI" },
  { id: "AR_CUIT", country: "AR", countryName: "Argentina", type: "CUIT" },
  { id: "CR_CEDULA", country: "CR", countryName: "Costa Rica", type: "Cédula" },
  { id: "PA_CEDULA", country: "PA", countryName: "Panamá", type: "Cédula" },
];

export const FAKE_PHONES = [
  { id: "EC_MOBILE", country: "EC", countryName: "Ecuador", type: "Móvil (+593 / 09…)" },
  { id: "CO_MOBILE", country: "CO", countryName: "Colombia", type: "Móvil (+57)" },
  { id: "CL_MOBILE", country: "CL", countryName: "Chile", type: "Móvil (+56)" },
  { id: "PE_MOBILE", country: "PE", countryName: "Perú", type: "Móvil (+51)" },
  { id: "MX_MOBILE", country: "MX", countryName: "México", type: "Móvil (+52)" },
  { id: "GT_MOBILE", country: "GT", countryName: "Guatemala", type: "Móvil (+502)" },
  { id: "AR_MOBILE", country: "AR", countryName: "Argentina", type: "Móvil (+54)" },
  { id: "CR_MOBILE", country: "CR", countryName: "Costa Rica", type: "Móvil (+506)" },
  { id: "PA_MOBILE", country: "PA", countryName: "Panamá", type: "Móvil (+507)" },
];

export function countriesFrom(list) {
  const map = new Map();
  for (const item of list) {
    if (!map.has(item.country)) {
      map.set(item.country, { value: item.country, label: `${item.countryName} (${item.country})` });
    }
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, "es"));
}

export function typesForCountry(list, country) {
  return list
    .filter((i) => i.country === country)
    .map((i) => ({ value: i.id, label: i.type }));
}
