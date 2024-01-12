insert into a.parent (name) values ('mom');

insert into a.parent (name) values ('dad');

insert into
    a.child (
        mom_parent_id,
        dad_parent_id,
        name
    )
values (1, 2, 'child 1');