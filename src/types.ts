export type Product = {
  name: string;
  url: string;
  inStock: boolean;
};

export type ProductState = {
  [url: string]: {
    name: string;
    inStock: boolean;
  };
};
