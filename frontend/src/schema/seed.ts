/** The default schema shown on first load. Block-style YAML only. */
export const SEED_YAML = `database:
  schemas:
    public:
      tables:
        user:
          columns:
            id:
              type: integer
              nullable: false
            username:
              type: varchar
              length: 25
              nullable: false
            password:
              type: varchar
              length: 50
              nullable: false
          constraints:
            pk_user__id:
              type: primary-key
              columns:
                - id
            idx_user__username:
              type: index
              columns:
                - username
        address:
          columns:
            id:
              type: integer
              nullable: false
            street:
              type: varchar
              length: 255
              nullable: false
            zip:
              type: integer
              nullable: false
            user_id:
              type: integer
              nullable: false
          constraints:
            pk_address__id:
              type: primary-key
              columns:
                - id
            uk_address__street__zip:
              type: unique
              columns:
                - street
                - zip
          foreign-keys:
            fk_address__user_id:
              source-column: user_id
              table: user
              target-column: id
`
