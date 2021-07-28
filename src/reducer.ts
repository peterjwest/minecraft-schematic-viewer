export interface Store {
  name?: string;
}

export const defaultStore: Store = {
  name: undefined,
};

export default (store = defaultStore, action: AppAction): Store => {
  if (action.type === 'UpdateName') {
    return { ...store, name: action.name };
  }
  return store;
};

export interface UpdateName {
  type: 'UpdateName';
  name: string;
}

export type AppAction = UpdateName;
