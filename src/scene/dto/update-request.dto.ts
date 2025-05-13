export class CRDTOperationDto {
  type: 'add' | 'edit' | 'delete';
  object?: any;
  uuid?: string;
  diff?: any;
  parent?: string;
}

export class UpdateSceneRequestDto {
  SceneID: string;
  SceneUUID: string;
  Operations: CRDTOperationDto[];
  UserToken: string;
  AuthToken: string;
}
