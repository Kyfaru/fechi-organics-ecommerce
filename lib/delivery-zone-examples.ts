export type ExampleDeliveryZone = {
  id: string;
  county: string;
  name: string;
  branchId: string | null;
  deliveryFeeKes: number;
};

export const EXAMPLE_DELIVERY_ZONES: ExampleDeliveryZone[] = [
  { id: "example-nairobi-westlands", county: "Nairobi", name: "Westlands", branchId: "branch-nairobi", deliveryFeeKes: 18000 },
  { id: "example-nairobi-kilimani", county: "Nairobi", name: "Kilimani", branchId: "branch-nairobi", deliveryFeeKes: 22000 },
  { id: "example-nairobi-karen", county: "Nairobi", name: "Karen", branchId: "branch-nairobi", deliveryFeeKes: 28000 },
  { id: "example-nakuru-cbd", county: "Nakuru", name: "Nakuru CBD", branchId: "branch-nakuru", deliveryFeeKes: 16000 },
  { id: "example-nakuru-lanet", county: "Nakuru", name: "Lanet", branchId: "branch-nakuru", deliveryFeeKes: 24000 },
  { id: "example-eldoret-cbd", county: "Uasin Gishu", name: "Eldoret CBD", branchId: "branch-eldoret", deliveryFeeKes: 17000 },
  { id: "example-eldoret-kapsoya", county: "Uasin Gishu", name: "Kapsoya", branchId: "branch-eldoret", deliveryFeeKes: 26000 },
  { id: "example-kiambu-thika-road", county: "Kiambu", name: "Thika Road", branchId: "branch-nairobi", deliveryFeeKes: 30000 },
  { id: "example-kiambu-ruaka", county: "Kiambu", name: "Ruaka", branchId: "branch-nairobi", deliveryFeeKes: 25000 },
];

export function exampleZonesForCounty(county: string) {
  return EXAMPLE_DELIVERY_ZONES.filter((zone) => zone.county === county);
}

export function exampleZoneById(id: string) {
  return EXAMPLE_DELIVERY_ZONES.find((zone) => zone.id === id) ?? null;
}
