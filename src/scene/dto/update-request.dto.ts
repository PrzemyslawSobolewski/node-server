export class CRDTOperationDto {
  type: 'add' | 'edit' | 'delete';
  object?: any;
  uuid?: string;
  diff?: any;
  parent?: string;
  timestamp?: number;
}

export class UpdateSceneRequestDto {
  sceneID: string;
  sceneUUID: string;
  operations: CRDTOperationDto[];
  userToken: string;
  authToken: string;
}
