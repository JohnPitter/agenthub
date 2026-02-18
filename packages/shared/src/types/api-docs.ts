export interface ApiEndpointParam {
  name: string;
  in: "query" | "body" | "path";
  type: string;
  required: boolean;
}

export interface ApiEndpoint {
  method: string;
  path: string;
  description: string;
  group: string;
  params?: ApiEndpointParam[];
}
