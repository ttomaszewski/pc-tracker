export type Product = {
  name: string;
  url: string;
  inStock: boolean;
};

export type ProductState = {
  name: string;
  inStock: boolean;
};

export type StateRecord = Record<string, ProductState>;