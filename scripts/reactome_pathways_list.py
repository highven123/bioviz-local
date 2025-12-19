# Reactome Pathways with Diagrams (Verified List)
# These are lower-level pathways that have actual diagram visualizations

REACTOME_PATHWAYS_WITH_DIAGRAMS = [
    # Signaling Pathways (15)
    'R-HSA-9006934',   # Signaling by Receptor Tyrosine Kinases
    'R-HSA-5673001',   # RAF/MAP kinase cascade
    'R-HSA-2586552',   # Signaling by Leptin
    'R-HSA-1433557',   # Signaling by SCF-KIT
    'R-HSA-186797',    # Signaling by PDGF
    'R-HSA-9006925',   # Intracellular signaling by second messengers
    'R-HSA-388396',    # GPCR downstream signalling
    'R-HSA-112316',    #otropic Ca2+ pathway
    'R-HSA-1257604',   # PIP3 activates AKT signaling
    'R-HSA-74749',     # Wnt ligand biogenesis and trafficking
    'R-HSA-195258',    # RHO GTPase Effectors
    'R-HSA-392451',    # G beta:gamma signalling through PI3Kgamma
    'R-HSA-166520',    # Signaling by NTRKs
    'R-HSA-983705',    # Signaling by the B Cell Receptor (BCR)
    'R-HSA-983695',    # Antigen activates B Cell Receptor (BCR) leading to generation of second messengers
    
    # Cell Cycle & DNA (10)
    'R-HSA-69275',     # G1/S Transition
    'R-HSA-68877',     # Mitotic Prometaphase
    'R-HSA-68882',     # Mitotic Anaphase
    'R-HSA-68886',     # M Phase
    'R-HSA-5693532',   # DNA Double-Strand Break Repair
    'R-HSA-5693567',   # HDR through Homologous Recombination (HRR)
    'R-HSA-73894',     # DNA Repair
    'R-HSA-69190',     # DNA strand elongation
    'R-HSA-68952',     # Activation of the pre-replicative complex
    'R-HSA-176974',    # Unwinding of DNA
    
    # Metabolism (8)
    'R-HSA-70326',     # Glucose metabolism
    'R-HSA-70268',     # Pyruvate metabolism
    'R-HSA-77289',     # Mitochondrial Fatty Acid Beta-Oxidation
    'R-HSA-71064',     # Fatty acid metabolism
    'R-HSA-556833',    # Metabolism of lipids
    'R-HSA-350864',    # Regulation of mRNA stability by proteins that bind AU-rich elements
    'R-HSA-71387',     # Metabolism of amino acids and derivatives
    'R-HSA-5668541',   # TNFR2 non-canonical NF-kB pathway
    
    # Immune System (10)
    'R-HSA-5669034',   # TNFs bind their physiological receptors
    'R-HSA-937061',    # TRIF-mediated programmed cell death
    'R-HSA-983168',    # Antigen processing: Ubiquitination & Proteasome degradation
    'R-HSA-983169',    # Class I MHC mediated antigen processing & presentation
    'R-HSA-202403',    # TCR signaling
    'R-HSA-202424',    # Downstream TCR signaling
    'R-HSA-202433',    # Generation of second messenger molecules
    'R-HSA-388841',    # Costimulation by the CD28 family
    'R-HSA-389948',    # PD-1 signaling
    'R-HSA-912631',    # Regulation of signaling by CBL
    
    # Apoptosis & Cell Death (7)
    'R-HSA-109581',    # Apoptosis
    'R-HSA-5357801',   # Programmed Cell Death
    'R-HSA-111465',    # Apoptotic cleavage of cellular proteins
    'R-HSA-140342',    # Apoptosis induced DNA fragmentation
    'R-HSA-5357769',   # Caspase activation via Death Receptors
    'R-HSA-75153',     # Apoptotic execution phase
    'R-HSA-2559582',   # Senescence-Associated Secretory Phenotype (SASP)
]

print(f"Total pathways: {len(REACTOME_PATHWAYS_WITH_DIAGRAMS)}")
