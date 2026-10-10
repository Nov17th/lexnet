/*
 * ProfileCheck: checks an ontology against the four OWL 2 profiles (DL, EL, QL, RL)
 * with the profile checker of the OWL API.
 *
 * This is a syntactic check, not reasoning. For each profile, the OWL API walks through
 * every axiom and every class or property expression and compares it with the grammar of
 * that profile in the W3C OWL 2 specification. It prints whether the file is in the profile
 * and, for RL, the axioms that break it. Consistency and inferences are checked by HermiT
 * in check_build.py, not here.
 *
 * Requirements
 *   - JDK 11 or later (Java 11+ can run a single .java file directly, no javac needed).
 *   - The Python package owlready2 (pip install owlready2), which check_build.py needs anyway.
 *     It ships the OWL API as owlready2/pellet/owlapi-distribution-3.4.3-bin.jar.
 *
 * Run on Windows (PowerShell), from the root of the repository:
 *   $jar = python -c "import owlready2,os;print(os.path.join(os.path.dirname(owlready2.__file__),'pellet','owlapi-distribution-3.4.3-bin.jar'))"
 *   java -cp $jar scripts\ProfileCheck.java ontology\lexnet-ontology.ttl
 *   java -cp $jar scripts\ProfileCheck.java build\lexnet-full.ttl
 *
 * Run on Linux or macOS, from the root of the repository:
 *   JAR=$(python3 -c "import owlready2,os;print(os.path.join(os.path.dirname(owlready2.__file__),'pellet','owlapi-distribution-3.4.3-bin.jar'))")
 *   java -cp "$JAR" scripts/ProfileCheck.java ontology/lexnet-ontology.ttl
 *   java -cp "$JAR" scripts/ProfileCheck.java build/lexnet-full.ttl
 *
 * Expected output (checked on 9 October 2026; log lines from SLF4J can be ignored)
 *   ontology file:  OWL 2 DL in profile; EL 17, QL 14, RL 3 violations
 *   full RDF file:  OWL 2 DL in profile; EL 17, QL 375, RL 3 violations
 *                   (QL also forbids owl:sameAs, which links words to Wikidata lexemes)
 *   The three RL violations are the class PolysemousEntry (at least two senses) and the
 *   restrictions to exactly one canonicalForm and exactly one isLexicalizedSenseOf.
 */
import java.io.File;
import org.semanticweb.owlapi.apibinding.OWLManager;
import org.semanticweb.owlapi.model.OWLOntology;
import org.semanticweb.owlapi.profiles.*;

public class ProfileCheck {
  public static void main(String[] args) throws Exception {
    if (args.length != 1) {
      System.err.println("Usage: java -cp <owlapi jar> ProfileCheck.java <ontology file>");
      System.exit(1);
    }
    // Load the file (Turtle, RDF/XML or another format the OWL API can parse)
    OWLOntology o = OWLManager.createOWLOntologyManager()
        .loadOntologyFromOntologyDocument(new File(args[0]));
    OWLProfile[] profiles = { new OWL2DLProfile(), new OWL2ELProfile(),
                              new OWL2QLProfile(), new OWL2RLProfile() };
    for (OWLProfile p : profiles) {
      OWLProfileReport r = p.checkOntology(o);
      System.out.println(p.getName() + ": " + (r.isInProfile()
          ? "in profile" : r.getViolations().size() + " violations"));
      // RL is the closest profile, so print its violations in full
      if (p instanceof OWL2RLProfile)
        for (OWLProfileViolation v : r.getViolations()) System.out.println("  " + v);
    }
  }
}
