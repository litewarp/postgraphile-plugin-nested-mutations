-- id: 1, nodeId: WyJQYXJlbnQiLDFd
insert into a.parent (name) values ('mom');

-- id: 2, nodeId: WyJQYXJlbnQiLDJd
insert into a.parent (name) values ('dad');

insert into
    a.child (
        mom_parent_id, dad_parent_id, name
    )
values (1, 2, 'child 1');