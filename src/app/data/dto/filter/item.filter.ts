export interface ItemFilter {
  name: string;
  nameInPath: string;
  parent: string;
  rootOnly: boolean;
  not: string[];
  id: string[];
}
