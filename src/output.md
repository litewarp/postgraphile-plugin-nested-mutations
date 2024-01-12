# Generate Types for Nested Mutations

## Input

### Nested Connector Type

Description: Input for the nested mutation of `foreignTableName` in the `tableTypeName` mutation

Typename Examples
- OpportunityIssuerIdFkeyInput
  - connectByOrganizationId
  - deleteByShortUrl
  - updateById
  - create

### Nested Connection Create Input

Description: The `foreignTableName` to be created by this mutation

Typename Examples

- OpportunityIsserIdFkeyOrganizationCreateInput
  - all organization input fields; and
  - all nested mutation fields

## Connect

### Nested Connect By Key Input Type

Description: The fields on `tableFieldName` to look up the row to connect

Typename Examples
- OrganizationOrganizationPkeyConnect
  - organizationId

- OrganizationOrganizationShortUrlKeyConnect
  - shortUrl

- UserOrganizationFollowUserOrganizationFollowPkeyConnect
  - userId
  - organizationId

### Nested Connect By Node Id Input Type 

Description: The globally unique `ID` lookup for the row to connect

Typename Examples
- OrganizationNodeIdConnect
- UserNodeIdConnect
  - id: ID!

## Delete

### Nested Delete By Key Input Type

### Nested Delete By Node Id Input Type

## Update

### Nested Update By Key Input Type

### Nested Update By Node Id Input Type

### Nested Update By Patch Type