--
-- PostgreSQL database dump
--

-- Dumped from database version 14.17
-- Dumped by pg_dump version 14.17

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: containers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.containers (
    id integer NOT NULL,
    container_id integer NOT NULL,
    status character varying(20) NOT NULL,
    last_check timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.containers OWNER TO postgres;

--
-- Name: containers_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.containers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.containers_id_seq OWNER TO postgres;

--
-- Name: containers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.containers_id_seq OWNED BY public.containers.id;


--
-- Name: files; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.files (
    id integer NOT NULL,
    user_id integer,
    filename character varying(255) NOT NULL,
    original_name character varying(255) NOT NULL,
    mime_type character varying(100),
    size_bytes bigint,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.files OWNER TO postgres;

--
-- Name: files_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.files_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.files_id_seq OWNER TO postgres;

--
-- Name: files_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.files_id_seq OWNED BY public.files.id;


--
-- Name: fragments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.fragments (
    id integer NOT NULL,
    file_id integer,
    fragment_index integer NOT NULL,
    container_id integer NOT NULL,
    fragment_name character varying(255) NOT NULL,
    size_bytes integer,
    checksum character varying(64)
);


ALTER TABLE public.fragments OWNER TO postgres;

--
-- Name: fragments_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.fragments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.fragments_id_seq OWNER TO postgres;

--
-- Name: fragments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.fragments_id_seq OWNED BY public.fragments.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id integer NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    name character varying(100),
    surname character varying(100),
    phone_number character varying(20),
    two_factor_enabled boolean DEFAULT false,
    two_factor_secret character varying(255),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.users_id_seq OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: containers id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.containers ALTER COLUMN id SET DEFAULT nextval('public.containers_id_seq'::regclass);


--
-- Name: files id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.files ALTER COLUMN id SET DEFAULT nextval('public.files_id_seq'::regclass);


--
-- Name: fragments id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fragments ALTER COLUMN id SET DEFAULT nextval('public.fragments_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Data for Name: containers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.containers (id, container_id, status, last_check) FROM stdin;
\.


--
-- Data for Name: files; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.files (id, user_id, filename, original_name, mime_type, size_bytes, created_at, updated_at) FROM stdin;
3	2	32dbd5f36d14d3ff1d5fb719b25005acf90b86423d027a5dd14f518cac33ada8	graficStraits.png	image/png	35960	2025-03-19 13:06:16.787478	2025-03-19 13:06:16.787478
4	2	1b711144e92f2405275ac3c644fe5647c1ccd14f7db7f472045ec3a0b4414e7a	verif.jpg	image/jpeg	77078	2025-03-19 14:48:11.021862	2025-03-19 14:48:11.021862
\.


--
-- Data for Name: fragments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.fragments (id, file_id, fragment_index, container_id, fragment_name, size_bytes, checksum) FROM stdin;
41	3	0	16	32dbd5f36d14d3ff1d5fb719b25005acf90b86423d027a5dd14f518cac33ada8_0_1742389576790	1798	0d937023d28159aca053b02b8d94f6b0
42	3	5	11	32dbd5f36d14d3ff1d5fb719b25005acf90b86423d027a5dd14f518cac33ada8_5_1742389576804	1798	7814119686836c586bf1943de266cb34
43	3	13	5	32dbd5f36d14d3ff1d5fb719b25005acf90b86423d027a5dd14f518cac33ada8_13_1742389576811	1798	3589951f0b303ab968b651d7f1dbb385
44	3	9	18	32dbd5f36d14d3ff1d5fb719b25005acf90b86423d027a5dd14f518cac33ada8_9_1742389576808	1798	d8168da40952a3f438720e444a203d44
45	3	3	19	32dbd5f36d14d3ff1d5fb719b25005acf90b86423d027a5dd14f518cac33ada8_3_1742389576801	1798	720b1a05878485480b00aa4fd4ab7752
46	3	16	13	32dbd5f36d14d3ff1d5fb719b25005acf90b86423d027a5dd14f518cac33ada8_16_1742389576814	1798	e0046d6549d4ea127fb2b250c28282d2
47	3	19	11	32dbd5f36d14d3ff1d5fb719b25005acf90b86423d027a5dd14f518cac33ada8_19_1742389576817	1798	aeb5647efcf4022d6b160de1cbe51c61
48	3	7	19	32dbd5f36d14d3ff1d5fb719b25005acf90b86423d027a5dd14f518cac33ada8_7_1742389576806	1798	48c1fab361a792b2a5d6b3e895a31067
49	3	8	19	32dbd5f36d14d3ff1d5fb719b25005acf90b86423d027a5dd14f518cac33ada8_8_1742389576807	1798	e3eaee8e8b49077f9d3900e0ad6254d0
50	3	17	3	32dbd5f36d14d3ff1d5fb719b25005acf90b86423d027a5dd14f518cac33ada8_17_1742389576814	1798	a6fde9a8674111235fca0b430067ce52
51	3	4	10	32dbd5f36d14d3ff1d5fb719b25005acf90b86423d027a5dd14f518cac33ada8_4_1742389576803	1798	8bbdd951faa9dda585c20bd01f2089d0
52	3	14	17	32dbd5f36d14d3ff1d5fb719b25005acf90b86423d027a5dd14f518cac33ada8_14_1742389576812	1798	424c7dc3afcad24195a4a083f62fecc8
54	3	18	9	32dbd5f36d14d3ff1d5fb719b25005acf90b86423d027a5dd14f518cac33ada8_18_1742389576815	1798	4dca7b15120d1e9880add0c7dc60bd77
53	3	10	13	32dbd5f36d14d3ff1d5fb719b25005acf90b86423d027a5dd14f518cac33ada8_10_1742389576808	1798	f99f1856c0cc3d101d82457353c1afc4
55	3	1	7	32dbd5f36d14d3ff1d5fb719b25005acf90b86423d027a5dd14f518cac33ada8_1_1742389576799	1798	8ba6e4cf52c14bd54348c8cee41d5919
56	3	2	11	32dbd5f36d14d3ff1d5fb719b25005acf90b86423d027a5dd14f518cac33ada8_2_1742389576800	1798	6d3a86a63460352e486873afc5eaff71
57	3	6	6	32dbd5f36d14d3ff1d5fb719b25005acf90b86423d027a5dd14f518cac33ada8_6_1742389576805	1798	737d450f6fa44643f8279a26ccf6b6ca
58	3	12	7	32dbd5f36d14d3ff1d5fb719b25005acf90b86423d027a5dd14f518cac33ada8_12_1742389576810	1798	63bfb7b32b2c05dd70c077f832d3aa89
59	3	15	13	32dbd5f36d14d3ff1d5fb719b25005acf90b86423d027a5dd14f518cac33ada8_15_1742389576813	1798	f00491c05bbdd0da6334e165bb8f416a
60	3	11	20	32dbd5f36d14d3ff1d5fb719b25005acf90b86423d027a5dd14f518cac33ada8_11_1742389576809	1798	4cf54ef9725cbaaba025835e0ade364c
61	4	5	16	1b711144e92f2405275ac3c644fe5647c1ccd14f7db7f472045ec3a0b4414e7a_5_1742395691042	3854	174d8216b899b7cf8571dca2b9debea4
62	4	11	12	1b711144e92f2405275ac3c644fe5647c1ccd14f7db7f472045ec3a0b4414e7a_11_1742395691047	3854	b855085efb4e84668c3064c0877b9947
63	4	4	5	1b711144e92f2405275ac3c644fe5647c1ccd14f7db7f472045ec3a0b4414e7a_4_1742395691042	3854	4bfb29a728b088ab09ae44faf7d715e6
64	4	19	15	1b711144e92f2405275ac3c644fe5647c1ccd14f7db7f472045ec3a0b4414e7a_19_1742395691053	3852	5a6456bf395f3ebfaf4e7d6db5080e40
65	4	12	4	1b711144e92f2405275ac3c644fe5647c1ccd14f7db7f472045ec3a0b4414e7a_12_1742395691048	3854	1785f7f38cbab889774654ce5df2aac9
66	4	17	5	1b711144e92f2405275ac3c644fe5647c1ccd14f7db7f472045ec3a0b4414e7a_17_1742395691051	3854	4c767dbb873c1304e26e7d8526f2e0af
67	4	9	6	1b711144e92f2405275ac3c644fe5647c1ccd14f7db7f472045ec3a0b4414e7a_9_1742395691045	3854	31e2212020d1fe6bcd7fb79ca7bbf58d
68	4	7	9	1b711144e92f2405275ac3c644fe5647c1ccd14f7db7f472045ec3a0b4414e7a_7_1742395691044	3854	df2cc8743d0c30f250fa890b94e48a72
69	4	15	17	1b711144e92f2405275ac3c644fe5647c1ccd14f7db7f472045ec3a0b4414e7a_15_1742395691050	3854	b1e3ff949779213306310bf335a00e80
70	4	1	8	1b711144e92f2405275ac3c644fe5647c1ccd14f7db7f472045ec3a0b4414e7a_1_1742395691039	3854	87e3b70586fb64ba1e59433be6724118
72	4	16	11	1b711144e92f2405275ac3c644fe5647c1ccd14f7db7f472045ec3a0b4414e7a_16_1742395691051	3854	1bd5454028e49ee1510a0203bbfa4bfc
71	4	6	15	1b711144e92f2405275ac3c644fe5647c1ccd14f7db7f472045ec3a0b4414e7a_6_1742395691043	3854	4d07727cd8cf57473bbfe56fcd9a15bf
73	4	3	20	1b711144e92f2405275ac3c644fe5647c1ccd14f7db7f472045ec3a0b4414e7a_3_1742395691041	3854	5c7251f99178374b5f0f8dfa50320c21
75	4	10	7	1b711144e92f2405275ac3c644fe5647c1ccd14f7db7f472045ec3a0b4414e7a_10_1742395691047	3854	404ebfa1f35a68db42a45e321ab40837
74	4	2	4	1b711144e92f2405275ac3c644fe5647c1ccd14f7db7f472045ec3a0b4414e7a_2_1742395691040	3854	02b2ee5e1784df60df6ab94838e8743f
76	4	13	18	1b711144e92f2405275ac3c644fe5647c1ccd14f7db7f472045ec3a0b4414e7a_13_1742395691049	3854	8053d6875a19b7b373a93280307c79d6
77	4	18	18	1b711144e92f2405275ac3c644fe5647c1ccd14f7db7f472045ec3a0b4414e7a_18_1742395691052	3854	07fdda8b6a136729e253f9b248b080ee
78	4	8	15	1b711144e92f2405275ac3c644fe5647c1ccd14f7db7f472045ec3a0b4414e7a_8_1742395691044	3854	b9d857fe63d9d54c13427edae1efcda5
79	4	14	20	1b711144e92f2405275ac3c644fe5647c1ccd14f7db7f472045ec3a0b4414e7a_14_1742395691050	3854	7fa5f92df02e577982c7950445316548
80	4	0	13	1b711144e92f2405275ac3c644fe5647c1ccd14f7db7f472045ec3a0b4414e7a_0_1742395691030	3854	b99dc4193617d755f3dadb2bf9d9f6dc
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, email, password_hash, name, surname, phone_number, two_factor_enabled, two_factor_secret, created_at, updated_at) FROM stdin;
1	test@example.com	\\\\\\/3pd0Jwj/GORqP1sylFim	Test	User	\N	f	\N	2025-03-12 11:55:38.12413	2025-03-12 11:55:38.12413
2	alex.visan2013@gmail.com	$2b$10$dagqxkIQ5.CCeYnWUt.iBOuIWfeiDmLh7.MbYT7ZJSvSEoATZW8G.	Alexandru Marian	Visan	0732935772	t	EZDXUJK3ERKGS5B2JBQUI32AGATESW3WN56TCLCNORUTI53MO4VA	2025-03-12 13:39:52.815459	2025-03-29 09:08:56.819903
3	alex.visan@aol.com	$2b$10$OH7SdeIkHAJGCZssSBNuhuC/3os/IjovIVp7OrfPb4H3YXxQnJvHa	Alex	Aol	0732935772	f	\N	2025-03-19 12:48:49.078142	2025-03-29 10:42:59.032782
5	alex.visan@mail.com	$2b$10$mpf2MxMOC.cy/FeCtF4pgOoaJihHNyn.mJLDMmMvzwzpkvshoz6s.	Alex	b	0732123123	f	JNVX2JSOGZQX2NB6K4QU66DBJJ5DCQDJOIUT443EGVNWSZDGKJIA	2025-03-29 12:04:33.085787	2025-03-29 12:04:33.085787
\.


--
-- Name: containers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.containers_id_seq', 1, false);


--
-- Name: files_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.files_id_seq', 6, true);


--
-- Name: fragments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.fragments_id_seq', 120, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.users_id_seq', 5, true);


--
-- Name: containers containers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.containers
    ADD CONSTRAINT containers_pkey PRIMARY KEY (id);


--
-- Name: files files_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_pkey PRIMARY KEY (id);


--
-- Name: fragments fragments_file_id_fragment_index_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fragments
    ADD CONSTRAINT fragments_file_id_fragment_index_key UNIQUE (file_id, fragment_index);


--
-- Name: fragments fragments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fragments
    ADD CONSTRAINT fragments_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: files files_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: fragments fragments_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fragments
    ADD CONSTRAINT fragments_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(id);


--
-- PostgreSQL database dump complete
--

