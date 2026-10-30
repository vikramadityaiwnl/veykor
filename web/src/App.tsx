import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";

function App() {
  return (
    <VStack
      gap={4}
      hAlign="center"
      justify="center"
      minHeight="100svh"
      padding={4}
    >
      <Heading level={1} weight="semibold">
        veykor
      </Heading>
      <Text>Neutral theme preview</Text>
      <Button label="Astryx button is working" variant="primary" size="lg" />
    </VStack>
  );
}

export default App;
