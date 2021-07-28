import * as React from 'react';
import { connect as reduxConnect, Matching, GetProps } from 'react-redux';
import { Dispatch, Action } from 'redux';

export interface ActionProps<Actions extends Action> {
  dispatch: Dispatch<Actions>;
}

export function connect<
  Store,
  ComponentClass
    extends React.ComponentClass<Matching<StoreProps & ActionProps<Actions>, GetProps<ComponentClass>>, State>,
  StoreProps,
  ComponentProps,
  State,
  Actions extends Action,
>
(component: ComponentClass, mapStoreProps: (store: Store) => StoreProps) {
  return reduxConnect<StoreProps, ActionProps<Actions>, ComponentProps>(
    mapStoreProps,
    (dispatch: Dispatch<Actions>): ActionProps<Actions> => ({ dispatch: dispatch }),
  )(component);
}
